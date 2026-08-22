# Third-Party Notices

OpenFieldPro itself is licensed under the GNU Affero General Public License,
version 3.0 only (see `LICENSE`). This notice lists the principal third-party
libraries the project depends on at runtime. Full license texts are
distributed with the packages in `node_modules` and are also available from
the npm registry or the upstream project repositories.

## Runtime and build dependencies

| Package | License | Used for |
|---|---|---|
| pdfkit | MIT | Server-generated invoice and estimate PDF documents |
| drizzle-orm / drizzle-kit | Apache-2.0 | Database schema, queries, and migrations |
| fastify | MIT | API framework |
| zod | MIT | Schema validation |
| nodemailer | MIT (EUPL-1.1 components) | Outbound SMTP email |
| postgres (postgres.js) | MIT | PostgreSQL client |
| next | MIT | Web application framework |
| react / react-dom | MIT | Web UI |
| tailwindcss / @tailwindcss/postcss | MIT | Styling |
| lucide-react | ISC | Icons |
| tsx | MIT | TypeScript execution for tooling and tests |
| typescript | Apache-2.0 | Type checking and builds |
| sharp | Apache-2.0 | Image processing |
| playwright / @playwright/test | Apache-2.0 | Browser tests |
| expo / react-native (mobile workspace) | MIT | Technician mobile app |
| fast-jwt | MIT | JWT signing and verification |
| jsonwebtoken | MIT | Session tokens |
| stripe | MIT | Online payments (optional) |
| mustache (removed) | — | — |

## Notes

- The API, web, and mobile applications do not embed or redistribute
  third-party code beyond the dependencies declared in their package
  manifests; all dependencies are fetched from the npm registry.
- Licenses are identified by the values declared by each project's package
  metadata. If you believe a dependency is mislabeled, open an issue with the
  package name and the correct license reference.
- The GNU AGPL-3.0 full text is included in `LICENSE`; the GNU GPL-3.0 and
  GNU LGPL-3.0 texts referenced by AGPL-3.0 are available from
  https://www.gnu.org/licenses/.

Copyright (C) 2026 Nikolas Marconcini
