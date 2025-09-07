use anchor_lang::prelude::*;

declare_id!("SoLGuaRdREG1stry11111111111111111111111111111");

#[program]
pub mod solguard_registry {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, ruleset_version: u16, min_grade: u8) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.ruleset_version = ruleset_version;
        cfg.min_grade = min_grade; // 0=red,1=yellow,2=green
        cfg.bump = ctx.bumps.config;
        
        emit!(ConfigInitialized {
            admin: cfg.admin,
            ruleset_version,
            min_grade,
        });
        
        Ok(())
    }

    pub fn add_oracle(ctx: Context<UpdateOracle>) -> Result<()> {
        let o = &mut ctx.accounts.oracle;
        o.bump = ctx.bumps.oracle;
        o.active = true;
        
        emit!(OracleAdded {
            oracle: ctx.accounts.oracle_key.key(),
            admin: ctx.accounts.admin.key(),
        });
        
        Ok(())
    }

    pub fn remove_oracle(ctx: Context<UpdateOracle>) -> Result<()> {
        let o = &mut ctx.accounts.oracle;
        o.active = false;
        
        emit!(OracleRemoved {
            oracle: ctx.accounts.oracle_key.key(),
            admin: ctx.accounts.admin.key(),
        });
        
        Ok(())
    }

    pub fn set_min_grade(ctx: Context<OnlyAdmin>, min_grade: u8) -> Result<()> {
        require!(min_grade <= 2, ErrorCode::InvalidGrade);
        let old_grade = ctx.accounts.config.min_grade;
        ctx.accounts.config.min_grade = min_grade;
        
        emit!(MinGradeUpdated {
            old_grade,
            new_grade: min_grade,
            admin: ctx.accounts.admin.key(),
        });
        
        Ok(())
    }

    pub fn bump_ruleset_version(ctx: Context<OnlyAdmin>, v: u16) -> Result<()> {
        let old_version = ctx.accounts.config.ruleset_version;
        ctx.accounts.config.ruleset_version = v;
        
        emit!(RulesetVersionBumped {
            old_version,
            new_version: v,
            admin: ctx.accounts.admin.key(),
        });
        
        Ok(())
    }

    pub fn attest_token(
        ctx: Context<AttestToken>, 
        ruleset_version: u16, 
        score: u16, 
        grade: u8, 
        proofs_hash: [u8; 32]
    ) -> Result<()> {
        // Validate inputs
        require!(ctx.accounts.oracle.active, ErrorCode::OracleInactive);
        require!(grade <= 2, ErrorCode::InvalidGrade);
        require!(score <= 10000, ErrorCode::InvalidScore);
        require!(ruleset_version == ctx.accounts.config.ruleset_version, ErrorCode::InvalidRulesetVersion);
        
        // Write/overwrite attestation
        let a = &mut ctx.accounts.attestation;
        a.mint = ctx.accounts.mint.key();
        a.ruleset_version = ruleset_version;
        a.score_bps = score; // score * 10000 (e.g., 0.9123 => 9123)
        a.grade = grade;     // 0=red,1=yellow,2=green
        a.proofs_hash = proofs_hash;
        a.attested_by = ctx.accounts.signer.key();
        a.attested_at = Clock::get()?.unix_timestamp;
        a.revoked = false;
        
        emit!(TokenAttested {
            mint: a.mint,
            ruleset_version,
            score,
            grade,
            attested_by: a.attested_by,
            attested_at: a.attested_at,
        });
        
        Ok(())
    }

    pub fn revoke_attestation(ctx: Context<Revoke>) -> Result<()> {
        let a = &mut ctx.accounts.attestation;
        require!(!a.revoked, ErrorCode::AlreadyRevoked);
        
        a.revoked = true;
        
        emit!(AttestationRevoked {
            mint: a.mint,
            ruleset_version: a.ruleset_version,
            admin: ctx.accounts.admin.key(),
        });
        
        Ok(())
    }
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub ruleset_version: u16,
    pub min_grade: u8,
    pub bump: u8,
}

#[account]
pub struct Oracle {
    pub bump: u8,
    pub active: bool,
}

#[account]
pub struct Attestation {
    pub mint: Pubkey,
    pub ruleset_version: u16,
    pub score_bps: u16,
    pub grade: u8,           // 0=red,1=yellow,2=green
    pub proofs_hash: [u8; 32],
    pub attested_by: Pubkey,
    pub attested_at: i64,
    pub revoked: bool,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init, 
        payer = payer, 
        space = 8 + 32 + 2 + 1 + 1, // discriminator + admin + version + grade + bump
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Admin pubkey, doesn't need to be signer for init
    pub admin: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OnlyAdmin<'info> {
    #[account(
        mut, 
        has_one = admin,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    #[account(
        mut, 
        has_one = admin,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(
        init_if_needed, 
        seeds = [b"oracle", oracle_key.key().as_ref()], 
        bump, 
        payer = admin, 
        space = 8 + 1 + 1 // discriminator + bump + active
    )]
    pub oracle: Account<'info, Oracle>,
    /// CHECK: Oracle pubkey (not necessarily a signer at creation)
    pub oracle_key: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(ruleset_version: u16)]
pub struct AttestToken<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [b"oracle", signer.key().as_ref()],
        bump = oracle.bump
    )]
    pub oracle: Account<'info, Oracle>,
    /// CHECK: token mint
    pub mint: UncheckedAccount<'info>,
    #[account(
        init_if_needed, 
        seeds = [b"attest", mint.key().as_ref(), &ruleset_version.to_le_bytes()], 
        bump, 
        payer = signer, 
        space = 8 + 32 + 2 + 2 + 1 + 32 + 32 + 8 + 1 // discriminator + mint + version + score + grade + hash + attester + time + revoked
    )]
    pub attestation: Account<'info, Attestation>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(ruleset_version: u16)]
pub struct Revoke<'info> {
    #[account(
        mut, 
        has_one = admin,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    /// CHECK: mint pubkey
    pub mint: UncheckedAccount<'info>,
    #[account(
        mut, 
        seeds = [b"attest", mint.key().as_ref(), &ruleset_version.to_le_bytes()], 
        bump
    )]
    pub attestation: Account<'info, Attestation>,
}

// Events
#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub ruleset_version: u16,
    pub min_grade: u8,
}

#[event]
pub struct OracleAdded {
    pub oracle: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct OracleRemoved {
    pub oracle: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct MinGradeUpdated {
    pub old_grade: u8,
    pub new_grade: u8,
    pub admin: Pubkey,
}

#[event]
pub struct RulesetVersionBumped {
    pub old_version: u16,
    pub new_version: u16,
    pub admin: Pubkey,
}

#[event]
pub struct TokenAttested {
    pub mint: Pubkey,
    pub ruleset_version: u16,
    pub score: u16,
    pub grade: u8,
    pub attested_by: Pubkey,
    pub attested_at: i64,
}

#[event]
pub struct AttestationRevoked {
    pub mint: Pubkey,
    pub ruleset_version: u16,
    pub admin: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Oracle inactive or not authorized")]
    OracleInactive,
    #[msg("Invalid grade value (must be 0-2)")]
    InvalidGrade,
    #[msg("Invalid score value (must be 0-10000)")]
    InvalidScore,
    #[msg("Invalid ruleset version")]
    InvalidRulesetVersion,
    #[msg("Attestation already revoked")]
    AlreadyRevoked,
}
