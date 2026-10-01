# Place CRUD local UI verification

This harness renders the real administrator components using **only** the local
Firestore emulator (`127.0.0.1:8185`, project `demo-place-crud`). It does not load
production Firebase configuration and uses a demo administrator token.

1. Start the Firestore emulator with this repository's `firestore.rules` on port
   8185. On Windows, use Java options `-Duser.language=en -Duser.country=US` to avoid
   the emulator's missing Korean error-message resource bundle.
2. Set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8185` and run
   `node --import tsx --test tests/placeCrudRules.test.ts`. This seeds and resets
   **only** the `demo-place-crud` emulator database.
3. Run `node tests/ui/serve.mjs` and open
   `http://127.0.0.1:3175/tests/ui/index.html`.
4. Exercise create, name search, region/category/status changes, page loading,
   displayed/all-condition selection, confirmation, hide and restore at desktop
   and mobile widths. Reload to verify persistence. Use the demo database to
   inspect public queries and unchanged Source/Favorite documents.

The harness supplies administrator authorization directly, so it does **not**
test Google login or the application's administrator route gate. Existing auth
unit tests cover those contracts; real browser auth regression remains a separate
verification step. No production write or deployment is needed.

`tests/adminCrudUi.test.mjs` checks server-rendered forms and labels. Passing it
does not establish browser interaction, responsive layout, or keyboard behavior.
