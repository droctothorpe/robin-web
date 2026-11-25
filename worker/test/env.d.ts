/// <reference path="../node_modules/@cloudflare/vitest-plugin/types/cloudflare-test.d.ts" />

// The test runner injects the D1 migrations as a binding; production has no such binding.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[]
  }
}
