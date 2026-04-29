# Contributing to Arena AI

Thanks for your interest in improving Arena AI! Whether you're fixing bugs, adding features, or improving docs — all contributions are welcome.

## Getting Started

### 1. Fork the Repository

Click the **Fork** button at the top right of the GitHub page.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR_USERNAME/arena.git
cd arena
```

### 3. Create a Branch

```bash
git checkout -b my-feature-name
```

### 4. Make Your Changes

Edit the code, test it locally:

```bash
# Docker way
./start.sh

# Or manual way
cd backend && npm run dev
# In another terminal:
cd frontend && npm run dev
```

### 5. Commit & Push

```bash
git add .
git commit -m "feat: add new feature"   # or "fix: bug description"
git push origin my-feature-name
```

### 6. Open a Pull Request

Go to the original repo on GitHub and click **New Pull Request**.

---

## Commit Message Style

We use simple prefixes:

| Prefix | Use For |
|--------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `docs:` | Documentation changes |
| `refactor:` | Code restructuring |
| `chore:` | Maintenance tasks |

Examples:
- `feat: add win/loss chart to leaderboard`
- `fix: resolve WebSocket reconnect bug`
- `docs: improve setup instructions`

---

## Need Help?

- Open an **Issue** on GitHub
- Describe what you're trying to do and where you're stuck

## Code of Conduct

Be respectful, be helpful, have fun building! 🏟️
