Composer Rich Diff Action
=========================

This is a GitHub Action which runs against a pull request and generates a comment
documenting the changes to Composer dependencies that are included in the pull
request.

Usage
-----

```yaml
name: Composer Rich Diff

on:
  pull_request:
    paths:
      - '.github/workflows/composer-diff.yml'
      - 'composer.json'
      - 'composer.lock'

permissions:
  contents: read
  pull-requests: write

jobs:
  diff:
    name: Generate Diff
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: cs278/composer-rich-diff-action@v1
        with:
          path: composer.json
```
