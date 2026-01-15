# Contributing to KubePolaris

First off, thank you for considering contributing to KubePolaris! 🎉

It's people like you that make KubePolaris such a great tool.

[中文版本](./CONTRIBUTING_zh.md)

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Guidelines](#coding-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one.

When creating a bug report, please include:

- **Clear title** describing the issue
- **Detailed description** of the bug
- **Steps to reproduce** the behavior
- **Expected behavior** vs actual behavior
- **Screenshots** if applicable
- **Environment details** (version, OS, browser, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Create an issue and provide:

- **Clear title** for the suggestion
- **Detailed description** of the proposed functionality
- **Use case** explaining why this would be useful
- **Possible implementation** if you have ideas

### Pull Requests

We actively welcome pull requests:

1. Fork the repo and create your branch from `main`
2. If you've added code, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Submit the pull request

## Development Setup

### Prerequisites

- Go 1.22+
- Node.js 18+
- MySQL 8.0+
- Docker & Docker Compose (optional)

### Backend Setup

```bash
# Clone the repository
git clone https://github.com/clay-wangzhi/KubePolaris.git
cd kubepolaris

# Install Go dependencies
go mod download

# Copy config file
cp configs/config.example.yaml configs/config.yaml

# Edit configuration
vim configs/config.yaml

# Run the backend
go run cmd/main.go
```

### Frontend Setup

```bash
# Navigate to frontend directory
cd ui

# Install dependencies
npm install
# or
pnpm install

# Start development server
npm run dev
```

### Database Setup

```bash
# Start MySQL with Docker
docker run -d \
  --name kubepolaris-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=kubepolaris \
  -p 3306:3306 \
  mysql:8.0

# Or use docker-compose
docker-compose up -d mysql
```

### Running Tests

```bash
# Backend tests
go test ./...

# Frontend tests
cd ui && npm test
```

## Coding Guidelines

### Go (Backend)

- Follow [Effective Go](https://golang.org/doc/effective_go)
- Use `gofmt` for formatting
- Use `golint` and `go vet` for linting
- Write tests for new functionality
- Add comments for exported functions

```go
// Good example
// ClusterService handles cluster-related operations
type ClusterService struct {
    db *gorm.DB
}

// GetByID retrieves a cluster by its ID
func (s *ClusterService) GetByID(id uint) (*Cluster, error) {
    // implementation
}
```

### TypeScript (Frontend)

- Follow [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- Use ESLint and Prettier
- Use functional components with hooks
- Define proper types, avoid `any`

```typescript
// Good example
interface ClusterProps {
  cluster: Cluster;
  onEdit: (id: number) => void;
}

const ClusterCard: React.FC<ClusterProps> = ({ cluster, onEdit }) => {
  // implementation
};
```

### API Design

- Use RESTful conventions
- Use proper HTTP methods (GET, POST, PUT, DELETE)
- Return consistent JSON responses
- Document endpoints with Swagger annotations

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(cluster): add cluster import validation

fix(terminal): resolve WebSocket reconnection issue

docs(readme): update installation instructions

refactor(api): simplify error handling middleware
```

## Pull Request Process

### Before Submitting

1. **Update documentation** if needed
2. **Add tests** for new functionality
3. **Run linters** and fix issues
4. **Run tests** and ensure they pass
5. **Rebase** on latest main branch

### PR Title

Follow the same format as commits:

```
feat(cluster): add support for multiple kubeconfig files
```

### PR Description

Use the PR template and include:

- Description of changes
- Related issue number
- Type of change
- Testing done
- Screenshots (for UI changes)

### Review Process

1. Automated checks must pass
2. At least one maintainer review
3. Address review comments
4. Squash commits if requested
5. Maintainer will merge when ready

## Getting Help

- 💬 [GitHub Discussions](https://github.com/clay-wangzhi/KubePolaris/discussions)
- 📖 [Documentation](http://kubepolaris.clay-wangzhi.com/docs)
- 🐛 [Issue Tracker](https://github.com/clay-wangzhi/KubePolaris/issues)

## Recognition

Contributors are recognized in:

- [CONTRIBUTORS.md](CONTRIBUTORS.md)
- Release notes
- README contributors section

Thank you for contributing! 🙏

