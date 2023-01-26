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

permissions:
    contents: read
    pull-requests: write

jobs:
  diff:
    name: Generate Diff
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cs278/composer-rich-diff-action@v1
        with:
          path: ./composer.json
```
