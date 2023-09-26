# hash.ai

The work-in-progress new site to be deployed on https://hash.ai

## Development

`yarn dev`

This app uses the Next.js App Router – your first step should be to [read the docs](https://nextjs.org/docs/app/building-your-application/routing) if you are unfamiliar with it.

## Known issues

There will be build warnings logged to the console related to MUI ([issue](https://github.com/vercel/next.js/issues/55663)):

```sh
The requested module '__barrel_optimize__?names=buttonClasses&wildcard!=!./Zoom' contains conflicting star exports for the name '__esModule' with the previous requested module '__barrel_optimize__?names=buttonClasses&wildcard!=!./utils'
```

These can be ignored – downgrading to `15.4.19` would avoid the warnings but at the cost of performance improvements
introduced to the development server in `15.5.x`.
