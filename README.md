# 🛡️ SOLGuard Protocol

**The First Comprehensive Token Security Framework for Solana**

[![CI](https://github.com/your-org/solguard-protocol/workflows/CI/badge.svg)](https://github.com/your-org/solguard-protocol/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana&logoColor=white)](https://solana.com/)

## 🎯 Overview

SOLGuard Protocol implements the **TSV-1 (Token Security Verification Standard)** - a comprehensive 12-rule security framework that provides on-chain attestations for token safety on Solana.

### Core Components

- **🔐 Smart Contracts**: Solana programs for on-chain attestations
- **📚 SDK Libraries**: TypeScript/JavaScript integration libraries  
- **🚀 Launchpad API**: Token gating and verification services
- **🔍 Oracle Service**: Automated security analysis engine
- **📊 Dashboard**: Admin interface for protocol management

## 🏗️ Repository Structure

```
solguard-protocol/
├── contracts/              # Solana Programs
│   └── solguard-registry/  # Main attestation program
├── packages/               # Shared Libraries
│   ├── solguard-core/     # TypeScript SDK
│   ├── solguard-oracle/   # Oracle service
│   └── solguard-types/    # Shared type definitions
├── apps/                  # Applications
│   ├── launchpad/        # Gating API
│   ├── dashboard/        # Admin interface
│   └── scanner/          # Analysis service
├── tools/                # Development Tools
│   ├── cli/             # SOLGuard CLI
│   └── scripts/         # Deployment scripts
└── docs/                # Documentation
    ├── TSV-1.md         # Security standard
    └── API.md           # API reference
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Solana CLI 1.16+
- Anchor Framework 0.28+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/solguard-protocol.git
cd solguard-protocol

# Install dependencies
npm install

# Build all packages
npm run build
```

### Development

```bash
# Start all services in development mode
npm run dev

# Build Solana contracts
npm run contracts:build

# Run tests
npm run test

# Start launchpad API only
npm run launchpad:start
```

## 📋 TSV-1 Security Standard

The Token Security Verification Standard evaluates tokens across 12 critical security dimensions:

| Rule | Category | Weight | Description |
|------|----------|--------|-------------|
| R1 | Ownership | 15% | Contract ownership and upgrade authority |
| R2 | Supply | 12% | Token supply mechanics and inflation |
| R3 | Liquidity | 10% | Market depth and trading availability |
| R4 | Holders | 8% | Distribution and concentration analysis |
| R5 | Trading | 10% | Volume patterns and market activity |
| R6 | Social | 5% | Community engagement and reputation |
| R7 | Technical | 15% | Code quality and security audits |
| R8 | Compliance | 10% | Regulatory and legal considerations |
| R9 | Governance | 8% | Decision-making and voting mechanisms |
| R10 | Transparency | 7% | Documentation and disclosure |

### Security Grades

- 🟢 **GREEN (0.8-1.0)**: Excellent security, minimal risk
- 🟡 **YELLOW (0.6-0.79)**: Good security, acceptable risk  
- 🟠 **ORANGE (0.4-0.59)**: Moderate security, elevated risk
- 🔴 **RED (0.0-0.39)**: Poor security, high risk

## 🔌 API Endpoints

### Core Services

```bash
# Health check
GET /health

# Token verification status
GET /api/guard/:symbol

# Launch requirements
GET /api/launch/requirements

# Attestation lookup
GET /api/attestation/:mint

# Launch eligibility check
POST /api/launch/check/:mint
```

### Example Usage

```typescript
import { SOLGuardClient } from '@solguard/core';

const client = new SOLGuardClient({
  endpoint: 'https://api.solguard.io',
  network: 'mainnet-beta'
});

// Check token security status
const result = await client.verifyToken('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
console.log(`Token grade: ${result.grade}, Score: ${result.score}`);

// Verify launch eligibility  
const eligible = await client.checkLaunchEligibility(mintAddress);
if (eligible.canLaunch) {
  console.log('Token meets TSV-1 requirements');
}
```

## 🛠️ Development

### Workspace Commands

```bash
# Install dependencies for all packages
npm install

# Build all packages and contracts
npm run build

# Run all tests
npm run test

# Lint all code
npm run lint

# Format all code
npm run format

# Type check all TypeScript
npm run type-check
```

### Contract Development

```bash
# Build Anchor programs
npm run contracts:build

# Test contracts
npm run contracts:test

# Deploy to devnet
npm run contracts:deploy
```

## 📚 Documentation

- [TSV-1 Standard](./docs/TSV-1.md) - Complete security framework specification
- [API Reference](./docs/API.md) - REST API documentation
- [Integration Guide](./docs/INTEGRATION.md) - Developer integration examples
- [Deployment Guide](./docs/DEPLOYMENT.md) - Production deployment instructions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Website](https://solguard.io)
- [Documentation](https://docs.solguard.io)
- [Discord](https://discord.gg/solguard)
- [Twitter](https://twitter.com/solguard_io)

---

**Built with ❤️ for the Solana ecosystem**
