# 🌵 Cactus

GitHub Action to create releases. It will create two pull requests.

## Release Strategies

This action supports two release strategies.

In the first one, all development already happens under the version that will be released. So, for example, if we wanted to release a version `3.2289.0` in two weeks time, then `package.json`, `package-lock.json` and `CHANGELOG.md` will already have `3.2289.0` specified.

In the second one, all development happens under the version that was released last. The current version to release is added when cutting.

## Pull Request into main

The first one goes into the default main development branch updating the versions in `/package-lock.json`, `/projects/{$project}/package.json` and `/projects/{$project}/CHANGELOG.md`.

In this example the release version would be `3.2289.0` and the new version `3.2290.0`, and the date of cut `29.06.2020`. The topmost changelog's entry needs to be in a format like this:

```markdown
## [3.2289.0] - Unreleased

- Some changes here
- Other changes
```

or:

```markdown
## Unreleased

- Some changes here
- Other changes
```

The action will create:

```markdown
## [3.2290.0] - Unreleased

...

## [3.2289.0] - 29.06.2020

- Some changes here
- Other changes
```

or, if no new version is specified:

```markdown
## Unreleased

...

## [3.2289.0] - 29.06.2020

- Some changes here
- Other changes
```

## Pull Request into release

This pull request gives an overview about the current release.

With a release version of e.g. `3.2289.0`, it will be created from `rc/${project}/3.2289.0` into `release/${project}/3.2289`.

Both the `rc` and the `release` branch are forked from the default main development branch.

The action will push two additional commits into the `rc` branch. One is a change to `/projects/{$project}/CHANGELOG.md`, replacing `Unreleased` with the date of the dispatch.

The other is a service file `/projects/{$project}/.release-service` containing a random hash. This file only exists, so that there is a difference in case there is no Changelog.

## Inputs

### Token

`token: string`

Required. Must be user based token with write permission,
so release creation action can trigger others,
like deploy.

### Release Version

`release_version: string`

Optional. Version of the release. Defaults to the version sepcified in `/projects/{$project}/package.json`.

### Project

`project: string`

Required. The action expects a project based structure, `projects/${project}/`. This is the project to be released. The projects path is configurable.

### Project Path

`project_path: string`.

Optional. Default: `projects`.

### Labels

`lables: multi-line string`

Optional. List of labels to add to release candidate upon creation.

## Usage Example

```yaml
name: Cut

on:
  workflow_dispatch:
    inputs:
      project:
        type: choice
        description: Project to cut
        required: true
        default: project-1
        options:
          - project-1
          - project-2
          - project-3

jobs:
  release:
    name: Cut
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - uses: zattoo/cactus@v4
        with:
          token: ${{secrets.USER_TOKEN}}
          project: ${{github.event.inputs.project}}
          labels: |
            release
            needs qa
            i18n
```
