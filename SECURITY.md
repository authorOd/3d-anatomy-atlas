# Security policy

## Supported versions

Security fixes go into the latest published version of each package:

| Package | Registry |
| --- | --- |
| `@authorod/svitylo-3d-anatomy-atlas` | npm |
| `@authorod/svitylo-3d-anatomy-data` | npm |
| `@authorod/svitylo-anatomy-markdown` | npm |
| `authorod/svitylo-anatomy-laravel` | Packagist |

Older versions do not get fixes: update to the latest one.

## Reporting a vulnerability

Do not open a public issue. Report the vulnerability privately through GitHub:
[report a vulnerability](https://github.com/authorOd/3d-anatomy-atlas/security/advisories/new)
(the **Security** tab of the repository). Include the package and its version, the steps to
reproduce and what an attacker gains. English or Ukrainian are both fine.

- You get a reply within 7 days that the report has been received.
- There is no fixed deadline for a fix; you are kept informed of the progress.
- There is no bug bounty. If you wish, you are credited in the advisory and in the changelog.

## Scope

In scope: the packages above and the demo app of this repository (`apps/demo`). For example:
script injection through an ```anatomy block, a share link or an atlas state; a way around the
Symfony HtmlSanitizer rules of the Laravel package; data files that do not match their
checksums.

Out of scope: the svitylo.com website, and attacks that need an already compromised device or
browser.
