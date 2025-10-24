# Event Sourcing Project AGENTS.md

## Project Overview

This is an example SaaS web app built with Node.js + Hono.js + Kysely + Emmett and our package `@wataruoguchi/emmett-event-store-kysely`.
With this app, we explain how to use `@wataruoguchi/emmett-event-store-kysely` with the working application.

## Setup / Build & Test

- Open the root folder in a `devcontainer`, then running `npm run dev` to start the backend application.
- `npm run test` to perform checks.
- `npm run build` to build production bundles.

## Code Style & Convention

### Formatting & Linting

- **Formatter**: [Biome](https://biomejs.dev/) for code formatting and linting
- **Configuration**: 2-space indentation, double quotes, organize imports on save
- **Pre-commit**: Automatic formatting via `lint-staged` and `husky`
- **TypeScript**: Strict mode enabled, no implicit any

### Architecture Patterns

- **Hexagonal Architecture**: Ports and Adapters pattern for modular monolith
- **Event Sourcing**: All state changes stored as immutable events
- **CQRS**: Command Query Responsibility Segregation
- **Functional Programming**: Prefer pure functions, avoid side effects
- **Dependency Injection**: Constructor injection for testability

### Code Organization

```txt
src/
├── modules/                    # Business modules (tenant, cart, generator)
│   └── module-name/
│       ├── domain/            # Pure business logic (entities, value objects)
│       ├── application/       # Use cases and orchestration
│       │   ├── ports/        # Interfaces (inbound/outbound)
│       │   ├── services/     # Application services
│       │   └── event-sourcing/ # Event handlers & projections
│       ├── adapters/         # Infrastructure implementations
│       └── tests/            # Module-specific tests
├── shared/                    # Shared infrastructure
└── workers/                   # Background workers
```


### Naming Conventions

- **Files**: kebab-case (`cart.service.ts`, `user-created.event.ts`)
- **Classes**: PascalCase (`CartService`, `UserCreatedEvent`)
- **Functions**: camelCase (`createCart`, `addItem`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Types/Interfaces**: PascalCase with descriptive suffixes (`CartPort`, `UserEntity`)

### Import Organization

- External libraries first
- Internal modules second
- Relative imports last
- Auto-organized by Biome on save

## Workflow / Git / PRs  

### Git Workflow

- **Main Branch**: `main` (protected, requires PR)
- **Feature Branches**: `feature/description` (e.g., `feature/crypto-shredding`)
- **Hotfix Branches**: `hotfix/description` (e.g., `hotfix/security-patch`)
- **Conventional Commits**: Use semantic commit messages

### Commit Message Format

```txt
type(scope): description

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
**Scopes**: `cart`, `tenant`, `generator`, `auth`, `db`, `tests`

**Examples**:

- `feat(cart): add crypto shredding support`
- `fix(tenant): resolve key rotation issue`
- `docs(api): update encryption policy examples`

### Pull Request Process

1. **Create Feature Branch**: From `main`, create descriptive branch name
2. **Implement Changes**: Follow coding standards and write tests
3. **Run Checks**: `npm run test && npm run type-check && npm run format`
4. **Create PR**: Use template, link issues, add reviewers
5. **Code Review**: Address feedback, ensure CI passes
6. **Merge**: Squash and merge to `main`

### Pre-commit Hooks

- **Formatting**: Auto-format code with Biome (lint-staged + husky)

## Environment & External Services  

### Development Environment

- **Container**: DevContainer with Node.js 20+ and PostgreSQL
- **Package Manager**: npm with lockfile versioning
- **Runtime**: Node.js with ES modules (`"type": "module"`)
- **Database**: PostgreSQL with native partitioning

### External Dependencies

- **Event Store**: `@wataruoguchi/emmett-event-store-kysely` (local package)
- **Web Framework**: Hono.js for HTTP API
- **Database**: Kysely for type-safe SQL queries
- **Event Sourcing**: Emmett for event sourcing patterns
- **Logging**: Pino for structured logging

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/database

# Application
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

### Database Setup

- **Migrations**: Kysely migrations for schema management
- **Codegen**: Automatic TypeScript types from database schema
- **Partitioning**: Tenant-based partitioning for multi-tenancy
- **Event Store**: Custom tables for event sourcing (messages, streams, subscriptions)

### Local Development

```bash
# Start development server
npm run dev

# Run database migrations
npm run migrate:up

# Generate database types
npm run codegen

# Start projection worker
npm run proj:worker
```

## Testing & Quality Assurance  

### Testing Framework

- **Test Runner**: [Vitest](https://vitest.dev/) for fast, modern testing
- **Coverage**: V8 coverage reporting with `@vitest/coverage-v8`
- **Type Checking**: TypeScript compilation before tests
- **Test Database**: Isolated test database per test suite

### Test Structure

```txt
src/modules/
├── cart/
│   └── tests/
│       ├── cart.e2e.spec.ts
│       ├── cart.consumer.spec.ts
├── generator/
│   └── tests/
│       └── generator.e2e.spec.ts
└── tenant/
    └── tests/
        └── tenant.e2e.spec.ts
```

### Testing Strategies

- **Unit Tests**: Test pure functions and business logic
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete user workflows
- **Projection Tests**: Use projection runner for fast, deterministic tests
- **Consumer Tests**: Use actual consumers for real-world scenarios

### Test Commands

```bash
# Run all tests
npm run test

# Run specific module tests
npm run t:c          # Cart module tests
npm run t:g          # Generator module tests

# Run with coverage
npm run test:coverage

# Type checking only
npm run type-check
```

### Quality Gates

- **Type Safety**: 100% TypeScript strict mode compliance
- **Test Coverage**: Minimum 80% code coverage
- **Linting**: Zero linting errors (Biome recommended rules)
- **Formatting**: Consistent code formatting
- **Performance**: Tests complete in < 30 seconds

### Test Best Practices

- **Fast Tests**: Use projection runner for 95% of tests
- **Isolated Tests**: Each test has its own database state
- **Cleanup**: Always clean up resources in `afterAll`
- **Realistic Data**: Use Faker.js for test data generation
- **Error Testing**: Test both success and failure scenarios

### Continuous Integration

- **Automated Testing**: All tests run on every commit
- **Type Checking**: TypeScript compilation verification
- **Code Quality**: Linting and formatting checks
- **Database Testing**: Migration and schema validation
- **Package Building**: Ensure package builds successfully