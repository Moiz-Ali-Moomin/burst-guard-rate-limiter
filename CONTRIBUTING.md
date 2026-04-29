# Contributing to Distributed Rate Limiter

Thank you for your interest in contributing! We welcome all contributions that help make this project more robust and feature-rich.

## How to Contribute

### 1. Reporting Bugs
- Use the GitHub Issues tracker.
- Provide a clear description of the bug and steps to reproduce it.
- Include information about your environment (Node.js version, Redis version, OS).

### 2. Suggesting Enhancements
- Open an issue to discuss the enhancement before starting work.
- Explain the use case and how it benefits the project.

### 3. Submitting Pull Requests
- Fork the repository.
- Create a new branch (`feat/your-feature` or `fix/your-fix`).
- Ensure your code follows the established style (run `npm run lint`).
- Add tests for any new functionality.
- Ensure all tests pass (`npm test`).
- Write clear, concise commit messages.

## Development Setup

1. Clone your fork:
   ```bash
   git clone https://github.com/your-username/distributed-rate-limiter.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and adjust settings.
4. Run the development server:
   ```bash
   npm run dev
   ```

## Code Quality Standards

- We use **ESLint** for linting and **Prettier** for formatting.
- We use **Husky** and **lint-staged** to ensure quality before commits.
- All public APIs should be documented in the `README.md`.

## Testing

- **Unit Tests**: Test individual components in isolation.
- **Integration Tests**: Test the full API flow with a mocked Redis.
- **Benchmarks**: Run benchmarks to ensure performance hasn't regressed.

Thank you for contributing!
