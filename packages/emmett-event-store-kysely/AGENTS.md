# @wataruoguchi/emmett-event-store-kysely - Package Development Guide

## Package Overview

This is a **TypeScript library** that provides a Kysely-based event store implementation for the [Emmett](https://github.com/event-driven-io/emmett) event sourcing framework. It enables event sourcing capabilities with PostgreSQL, including snapshot projections, event consumers, and multi-tenancy support.

## Package Architecture

### Core Components

- **Event Store** (`KyselyEventStore`) - Full event sourcing with PostgreSQL
- **Snapshot Projections** - Recommended approach for read models
- **Event Consumer** - Continuous background event processing
- **Projection Runner** - On-demand processing for tests
- **Type Safety** - Full TypeScript support with discriminated unions

### Package Structure

```txt
src/
├── event-store/
│   ├── kysely-event-store.ts    # Core event store implementation
│   └── consumers.ts             # Event consumer for background processing
├── projections/
│   ├── snapshot-projection.ts   # Snapshot projection implementation
│   └── runner.ts               # Projection runner for tests
├── types.ts                    # Shared type definitions
├── db-schema.ts               # Database schema types
└── index.ts                   # Public API exports
```

## Code Style & Convention

### TypeScript Standards

- **Strict Mode**: Full TypeScript strict mode compliance
- **Type Safety**: Comprehensive type definitions for all APIs
- **Generic Constraints**: Proper generic constraints for type safety
- **Discriminated Unions**: Use discriminated unions for event types
- **Interface Segregation**: Small, focused interfaces

### API Design Principles

- **Emmett Compatibility**: Full compatibility with Emmett interfaces
- **Extensibility**: Easy to extend with custom implementations
- **Performance**: Optimized for PostgreSQL and Kysely
- **Multi-tenancy**: Built-in partition support
- **Type Safety**: Zero runtime type errors

### Code Organization

```typescript
// Event Store Interface
export interface KyselyEventStore extends EventStore<KyselyReadEventMetadata> {
  readStream<EventType extends Event>(
    streamName: string,
    options?: ReadStreamOptions<bigint> | ProjectionReadStreamOptions,
  ): Promise<ReadStreamResult<EventType, KyselyReadEventMetadata>>;
  
  appendToStream<EventType extends Event>(
    streamName: string,
    events: EventType[],
    options?: ExtendedAppendToStreamOptions,
  ): Promise<AppendToStreamResultWithGlobalPosition>;
}
```

### Naming Conventions

- **Interfaces**: PascalCase with descriptive names (`KyselyEventStore`, `SnapshotProjectionConfig`)
- **Types**: PascalCase with descriptive suffixes (`KyselyReadEventMetadata`, `ProjectionHandler`)
- **Functions**: camelCase with action verbs (`createSnapshotProjection`, `getKyselyEventStore`)
- **Constants**: UPPER_SNAKE_CASE or PascalCase (`DEFAULT_PARTITION`, `PostgreSQLEventStoreDefaultStreamVersion`)

### Error Handling

- **Type Safety**: All errors are properly typed
- **Emmett Compatibility**: Errors match Emmett's error types
- **Logging**: Structured logging with context
- **Graceful Degradation**: Handle database connection issues

## Workflow / Git / PRs

### Package Development Workflow

- **Version Management**: Semantic versioning with `semantic-release`
- **Release Process**: Automated releases on main branch
- **Breaking Changes**: Major version bumps for breaking changes
- **Feature Flags**: Use configuration for new features

### Commit Message Format

```txt
type(scope): description

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `release`
**Scopes**: `event-store`, `projections`, `consumer`, `types`, `docs`, `build`

**Examples**:

- `feat(event-store): add crypto shredding support`
- `fix(projections): resolve snapshot projection race condition`
- `docs(api): update event store usage examples`
- `release: v1.2.0`

### Release Process

1. **Feature Development**: Develop features in feature branches
2. **Testing**: Comprehensive testing with Vitest
3. **Documentation**: Update API documentation and examples
4. **Merge to Main**: Merge feature branch to main
5. **Automated Release**: Semantic-release automatically creates releases
6. **NPM Publishing**: Automatic publishing to NPM registry

### Pre-commit Hooks

## Environment & External Services

### Development Environment

- **Node.js**: 20+ with ES modules support
- **TypeScript**: 5.8+ with strict mode
- **Package Manager**: npm with lockfile versioning
- **Database**: PostgreSQL 14+ for development and testing

### External Dependencies

- **Emmett**: `@event-driven-io/emmett` (peer dependency)
- **Kysely**: `kysely` (peer dependency) for type-safe SQL
- **TypeScript**: Full TypeScript support

### Package Dependencies

```json
{
  "peerDependencies": {
    "@event-driven-io/emmett": "^0.38.6",
    "kysely": "^0.28.7"
  },
  "optionalDependencies": {
    "@rollup/rollup-linux-x64-gnu": "4.9.5"
  }
}
```

### Build Configuration

- **TypeScript**: Strict compilation with declaration files
- **Bundling**: tsup for dual ESM/CJS builds
- **Exports**: Conditional exports for different entry points
- **Types**: Separate type declaration files

### Package Exports

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

## Testing & Quality Assurance

### Testing Framework

- **Test Runner**: [Vitest](https://vitest.dev/) for fast, modern testing
- **Coverage**: V8 coverage reporting with `@vitest/coverage-v8`
- **Type Checking**: TypeScript compilation before tests
- **Database Testing**: Isolated test database per test suite

### Test Structure

```txt
src/tests/
├── functionality.test.ts        # Core functionality tests
├── integration.test.ts         # Integration tests
├── error-handling.test.ts      # Error scenario tests
├── projections.test.ts         # Projection-specific tests
├── package.test.ts             # Package export tests
├── constants.test.ts          # Constant and configuration tests
└── test-utils.ts              # Test utilities and helpers
```

### Testing Strategies

- **Unit Tests**: Test individual functions and methods
- **Integration Tests**: Test component interactions
- **Error Tests**: Test error handling and edge cases
- **Performance Tests**: Test database performance and memory usage
- **Type Tests**: Test TypeScript type safety

### Test Commands

```bash
# Run all tests
npm run test

# Type checking only
npm run type-check

# Build package
npm run build
```

### Quality Gates

- **Type Safety**: 100% TypeScript strict mode compliance
- **Test Coverage**: Minimum 90% code coverage
- **Emmett Compatibility**: All Emmett interfaces properly implemented
- **Performance**: Database operations complete in reasonable time
- **Memory**: No memory leaks in long-running processes

### Test Best Practices

- **Isolated Tests**: Each test has its own database state
- **Cleanup**: Always clean up resources in `afterAll`
- **Realistic Data**: Use realistic test data for database operations
- **Error Testing**: Test both success and failure scenarios
- **Type Testing**: Verify TypeScript types work correctly

### Database Testing

- **Test Database**: Isolated test database per test suite
- **Migrations**: Test database schema migrations
- **Partitioning**: Test multi-tenant partitioning
- **Event Store**: Test event store operations
- **Projections**: Test snapshot projection updates

### Performance Testing

- **Event Store Performance**: Test append and read performance
- **Projection Performance**: Test projection update performance
- **Consumer Performance**: Test consumer processing performance
- **Memory Usage**: Monitor memory usage during tests
- **Concurrency**: Test concurrent operations

### Continuous Integration

- **Automated Testing**: All tests run on every commit
- **Type Checking**: TypeScript compilation verification
- **Package Building**: Ensure package builds successfully
- **NPM Publishing**: Test NPM package publishing
- **Documentation**: Verify API documentation is up to date

### Release Testing

- **Version Compatibility**: Test with different Emmett versions
- **Database Compatibility**: Test with different PostgreSQL versions
- **Node.js Compatibility**: Test with different Node.js versions
- **Package Installation**: Test package installation and usage
- **Breaking Changes**: Test for breaking changes in new versions

### Documentation Testing

- **API Documentation**: Verify all public APIs are documented
- **Examples**: Test all code examples work correctly
- **Type Definitions**: Verify TypeScript types are accurate
- **Migration Guides**: Test migration guides for version upgrades
- **Troubleshooting**: Test troubleshooting guides

### Security Testing

- **SQL Injection**: Test for SQL injection vulnerabilities
- **Input Validation**: Test input validation and sanitization
- **Access Control**: Test multi-tenant access control
- **Data Privacy**: Test data privacy and isolation
- **Audit Trail**: Test audit trail and logging

### Monitoring & Observability

- **Logging**: Structured logging with context
- **Metrics**: Performance metrics and monitoring
- **Error Tracking**: Comprehensive error tracking
- **Health Checks**: Database and service health checks
- **Alerting**: Automated alerting for issues

---

## Package Development Guidelines

### API Design

- **Consistency**: Consistent API patterns across all components
- **Extensibility**: Easy to extend with custom implementations
- **Performance**: Optimized for PostgreSQL and Kysely
- **Type Safety**: Comprehensive TypeScript support
- **Documentation**: Clear, comprehensive API documentation

### Breaking Changes

- **Major Versions**: Breaking changes require major version bumps
- **Migration Guides**: Provide clear migration guides
- **Deprecation Warnings**: Warn about deprecated features
- **Backward Compatibility**: Maintain compatibility when possible
- **Testing**: Test breaking changes thoroughly

### Performance Considerations

- **Database Optimization**: Optimize database queries and operations
- **Memory Management**: Efficient memory usage for large datasets
- **Concurrency**: Handle concurrent operations safely
- **Caching**: Implement appropriate caching strategies
- **Monitoring**: Monitor performance metrics

### Security Considerations

- **SQL Injection**: Prevent SQL injection attacks
- **Input Validation**: Validate and sanitize all inputs
- **Access Control**: Implement proper access control
- **Data Privacy**: Protect sensitive data
- **Audit Trail**: Maintain comprehensive audit trails

### Documentation Standards

- **API Documentation**: Complete API reference
- **Code Examples**: Working code examples
- **Migration Guides**: Clear migration instructions
- **Troubleshooting**: Comprehensive troubleshooting guides
- **Best Practices**: Recommended usage patterns
