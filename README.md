# HASH.dev

## Start the backend

```
yarn serve:hash-backend
```

On first run, or if you want to reset the database to the initial mock data, 
after starting the backend run:
```
yarn seed-db
```

## Install the frontend and required remote blocks
`yarn install:demo`

## Start the frontend and required blocks
`yarn demo-sans-backend`

## Create a new block bundle from template
1. `yarn new:block <name>`
2. code in `packages/hash/blocks/<name>`

## Code quality

We use git hooks to enforce code quality. These hooks are located in the
[hooks/](./hooks) directory. You will need to manually copy these to
`.git/hooks` and enable execution with `chmod u+x .git/hooks/<HOOK NAME>`.

## Monorepo
In order to work w/ multiple packages in a single repository, they must adhere to some conventions.
Each package should

- have its own workspace
- live on the `@hashintel` namespace
- expose a `lint` script and therefor depend on npm packages (`devDependencies`)
  - `@typescript-eslint`
  - `eslint-config-prettier`

### `yarn lint`
Every package has to provide a `lint` script. To lint all packages, run `yarn lint`.
If no such script can be reasonably provided, use `echo n/a` instead.

### `yarn format`
Every package has to provide a `format` script. To format all packages, run `yarn format`.
If no such script can be reasonably provided, use `echo n/a` instead.
