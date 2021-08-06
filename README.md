# 🌵 Cactus

GitHub Action to populate release branches based on CHANGELOG.md information.

## Inputs

### Token

`token: string`

Required. Must be user based token, so release creation action can trigger others, like deploy.

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
      - uses: zattoo/release-version@cactus
        with:
          token: ${{secrets.USER_TOKEN}}
```
