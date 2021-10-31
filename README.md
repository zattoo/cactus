# 🌵 Cactus

GitHub Action to create releases based on CHANGELOG.md

## Inputs

### Token

`token: string`

Required. Must be user based token with write permission,
so release creation action can trigger others,
like deploy.

## Usage Example

````yaml
name: Cactus

on:
  push:
    branches:
      - main

jobs:
  release:
    name: Cactus
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: zattoo/cactus@v2
        with:
          token: ${{secrets.USER_TOKEN}}
```
