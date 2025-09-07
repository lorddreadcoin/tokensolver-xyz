# TSV-1: TokenSOLver Security Verification Standard

**Version:** 1.0.0  
**Date:** September 6, 2025  
**Authors:** TokenSOLver × $ABS Protocol Team  

## Abstract

The TokenSOLver Security Verification Standard (TSV-1) defines a comprehensive framework for evaluating the security and legitimacy of Solana-based tokens. This specification establishes 12 critical security rules, a weighted scoring system, and on-chain attestation mechanisms to protect users from malicious tokens and rug pulls.

## 1. Introduction

### 1.1 Purpose

TSV-1 addresses the critical need for standardized token security verification in the Solana ecosystem. By implementing automated off-chain analysis combined with on-chain attestations, TSV-1 provides:

- **Standardized Security Assessment**: Consistent evaluation criteria across all tokens
- **Transparent Scoring**: Public, auditable security scores and grades
- **Launchpad Integration**: Gated token launches requiring minimum security standards
- **Real-time Monitoring**: Continuous surveillance for security violations

### 1.2 Scope

This specification covers:
- Security rule definitions and validation logic
- Scoring algorithms and grade classifications
- On-chain attestation protocol
- Oracle network requirements
- Launchpad integration standards

## 2. Security Rules

TSV-1 defines 12 security rules (R1-R12) that evaluate different aspects of token security:

### R1: Mint Authority Control
**Weight:** 20 (Critical)  
**Description:** Mint authority must be either null or controlled by a multisig wallet.

**Validation Logic:**
- ✅ **PASS**: Mint authority is null OR mint authority is a known multisig program
- ❌ **FAIL**: Mint authority is a single wallet address

**Rationale:** Prevents unlimited token minting that could dilute holder value.

### R2: Freeze Authority Control
**Weight:** 15 (High)  
**Description:** Freeze authority must be either null or controlled by a multisig wallet.

**Validation Logic:**
- ✅ **PASS**: Freeze authority is null OR freeze authority is a known multisig program
- ❌ **FAIL**: Freeze authority is a single wallet address

**Rationale:** Prevents arbitrary freezing of user token accounts.

### R3: Metadata Validation
**Weight:** 10 (Medium)  
**Description:** Token must have complete, valid metadata.

**Validation Logic:**
- ✅ **PASS**: Name, symbol, and URI are present and valid
- ❌ **FAIL**: Missing or invalid metadata fields

**Rationale:** Ensures token legitimacy and prevents impersonation.

### R4: Supply Cap Reasonableness
**Weight:** 8 (Medium)  
**Description:** Total supply must be within reasonable bounds.

**Validation Logic:**
- ✅ **PASS**: Supply ≤ 1,000,000,000,000 tokens
- ❌ **FAIL**: Supply > 1,000,000,000,000 tokens

**Rationale:** Prevents tokens with excessive supply that could indicate scam behavior.

### R5: Pool Verification
**Weight:** 12 (High)  
**Description:** Token must have a verified, active liquidity pool.

**Validation Logic:**
- ✅ **PASS**: Active pool found on major DEX (Raydium, Orca, etc.)
- ❌ **FAIL**: No active pool or pool on unverified DEX

**Rationale:** Ensures token has legitimate trading infrastructure.

### R6: LP Time-Lock
**Weight:** 18 (Critical)  
**Description:** LP tokens must be time-locked for minimum 30 days.

**Validation Logic:**
- ✅ **PASS**: LP tokens locked for ≥ 30 days
- ❌ **FAIL**: LP tokens not locked or locked for < 30 days

**Rationale:** Prevents rug pulls through immediate liquidity removal.

### R7: Pool Depth Adequacy
**Weight:** 5 (Low)  
**Description:** Pool must have sufficient liquidity depth.

**Validation Logic:**
- ✅ **PASS**: Pool liquidity ≥ $10,000 USD equivalent
- ❌ **FAIL**: Pool liquidity < $10,000 USD equivalent

**Rationale:** Ensures meaningful trading liquidity exists.

### R8: No LP Mint After Lock
**Weight:** 15 (High)  
**Description:** No new LP tokens should be minted after initial lock.

**Validation Logic:**
- ✅ **PASS**: No LP minting events after lock timestamp
- ❌ **FAIL**: LP minting detected after lock

**Rationale:** Prevents dilution of locked LP through additional minting.

### R9: Top Holder Threshold
**Weight:** 8 (Medium)  
**Description:** Top 10 holders should not control excessive token supply.

**Validation Logic:**
- ✅ **PASS**: Top 10 holders control < 70% of supply
- ❌ **FAIL**: Top 10 holders control ≥ 70% of supply

**Rationale:** Ensures reasonable token distribution.

### R10: Whale Risk Assessment
**Weight:** 6 (Medium)  
**Description:** Major holders should not exhibit high-risk behavior patterns.

**Validation Logic:**
- ✅ **PASS**: No high-risk wallets among top 20 holders
- ❌ **FAIL**: High-risk wallets detected in top holders

**Rationale:** Identifies potentially malicious large holders.

### R11: Program Log Analysis
**Weight:** 4 (Low)  
**Description:** Recent program interactions should not show anomalous patterns.

**Validation Logic:**
- ✅ **PASS**: No suspicious program log patterns detected
- ❌ **FAIL**: Anomalous program behavior identified

**Rationale:** Detects potential smart contract exploits or unusual behavior.

### R12: Router Behavior Analysis
**Weight:** 3 (Low)  
**Description:** DEX router interactions should follow normal patterns.

**Validation Logic:**
- ✅ **PASS**: Normal router interaction patterns
- ❌ **FAIL**: Suspicious router behavior detected

**Rationale:** Identifies potential MEV attacks or routing manipulation.

## 3. Scoring System

### 3.1 Score Calculation

The overall security score is calculated using weighted rule results:

```
Score = Σ(Rule_Weight × Rule_Result) / Σ(Rule_Weight)
```

Where:
- `Rule_Result` = 1.0 for PASS, 0.0 for FAIL
- Total possible weight = 124

### 3.2 Grade Classification

Scores are converted to letter grades:

| Grade | Score Range | Description | Launchpad Eligibility |
|-------|-------------|-------------|----------------------|
| 🟢 **GREEN** | 0.85 - 1.00 | Excellent security | ✅ Approved |
| 🟡 **YELLOW** | 0.70 - 0.84 | Good security | ✅ Approved |
| 🔴 **RED** | 0.00 - 0.69 | Poor security | ❌ Rejected |

### 3.3 Critical Rule Override

Failure of critical rules (R1, R6) with weight ≥ 15 automatically results in RED grade regardless of overall score.

## 4. On-Chain Attestation Protocol

### 4.1 Program Architecture

The SOLGuard Registry is an Anchor program that manages:
- **Config Account**: Global configuration and oracle management
- **Oracle Accounts**: Authorized attestation providers
- **Attestation Accounts**: Token security attestations

### 4.2 Attestation Process

1. **Off-chain Analysis**: Oracle performs TSV-1 rule validation
2. **Score Calculation**: Weighted score and grade determination
3. **Proof Generation**: Cryptographic hash of analysis results
4. **On-chain Submission**: Attestation stored with proof hash
5. **Verification**: Launchpad validates attestation before token approval

### 4.3 Account Structure

#### Config Account
```rust
pub struct Config {
    pub authority: Pubkey,
    pub min_grade: u8,
    pub ruleset_version: u16,
    pub oracle_count: u32,
}
```

#### Oracle Account
```rust
pub struct Oracle {
    pub authority: Pubkey,
    pub is_active: bool,
    pub attestation_count: u64,
    pub last_attestation: i64,
}
```

#### Attestation Account
```rust
pub struct Attestation {
    pub mint: Pubkey,
    pub oracle: Pubkey,
    pub ruleset_version: u16,
    pub score_bps: u16,
    pub grade: u8,
    pub proof_hash: [u8; 32],
    pub attested_at: i64,
    pub revoked: bool,
}
```

## 5. Oracle Network

### 5.1 Oracle Requirements

Authorized oracles must:
- Maintain high uptime (>99%)
- Use verified data sources (QuickNode, Helius)
- Implement proper error handling
- Provide audit trails

### 5.2 Data Sources

Primary data sources for rule validation:
- **Solana RPC**: On-chain account data
- **Helius API**: Token metadata and holder analysis
- **QuickNode**: Transaction history and program logs
- **DEX APIs**: Pool data and liquidity metrics

### 5.3 Attestation Frequency

- **New Tokens**: Immediate attestation upon detection
- **Existing Tokens**: Re-attestation every 7 days
- **Triggered Re-attestation**: On significant events (large transfers, pool changes)

## 6. Launchpad Integration

### 6.1 Gating Requirements

Token launches require:
- Valid TSV-1 attestation
- Minimum YELLOW grade
- Current ruleset version
- Non-revoked status

### 6.2 API Endpoints

#### Check Token Eligibility
```http
POST /api/launch/check/:mint
```

#### Submit Token Launch
```http
POST /api/launch/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "mint": "string",
  "launcher": "string",
  "metadata": {...},
  "launch_config": {...},
  "fee_payment_signature": "string"
}
```

### 6.3 Launch Fees

- **Standard Fee**: 0.1 SOL
- **Treasury Wallet**: Multi-sig controlled
- **Fee Verification**: On-chain transaction validation

## 7. Security Considerations

### 7.1 Oracle Security

- Multi-oracle consensus for critical decisions
- Stake-based oracle incentives
- Slashing for malicious behavior
- Regular oracle rotation

### 7.2 Proof Integrity

- Cryptographic proof hashes prevent tampering
- Off-chain data availability for audit
- Deterministic scoring algorithms
- Version control for rule updates

### 7.3 Attack Vectors

**Sybil Attacks**: Prevented through oracle authorization and staking
**Data Manipulation**: Mitigated by multiple data sources and consensus
**Replay Attacks**: Prevented by timestamp validation and nonce usage
**Griefing Attacks**: Rate limiting and fee requirements

## 8. Governance

### 8.1 Rule Updates

TSV-1 rules may be updated through:
- Community governance proposals
- Security committee review
- Gradual rollout with version control
- Backward compatibility maintenance

### 8.2 Oracle Management

- Oracle addition/removal through governance
- Performance monitoring and evaluation
- Stake requirements and slashing conditions
- Reward distribution mechanisms

## 9. Implementation Status

### 9.1 Current Implementation

- ✅ Core rule definitions and validation logic
- ✅ Scoring algorithm and grade calculation
- ✅ Anchor program for on-chain attestations
- ✅ Oracle service with off-chain analysis
- ✅ Launchpad middleware for gating
- ✅ API endpoints for integration

### 9.2 Future Enhancements

- 🔄 Multi-oracle consensus mechanism
- 🔄 Automated governance integration
- 🔄 Advanced ML-based risk detection
- 🔄 Cross-chain compatibility
- 🔄 Insurance integration for verified tokens

## 10. Conclusion

TSV-1 establishes a comprehensive framework for token security verification on Solana. By combining automated analysis, on-chain attestations, and launchpad integration, TSV-1 creates a robust defense against malicious tokens while enabling legitimate projects to demonstrate their security credentials.

The standard is designed to evolve with the ecosystem, incorporating new security threats and community feedback while maintaining backward compatibility and transparency.

---

**For technical implementation details, see:**
- [SOLGuard Registry Program](../contracts/solguard-registry/)
- [SOLGuard Core Package](../packages/solguard-core/)
- [SOLGuard Oracle Service](../packages/solguard-oracle/)
- [Launchpad Integration](../apps/launchpad/)

**Contact:**
- GitHub: [TokenSOLver Organization](https://github.com/TokenSOLver)
- Discord: [SOLGuard Community](https://discord.gg/solguard)
- Email: security@tokenSOLver.com
