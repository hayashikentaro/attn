import {
  formatEnvReport,
  getEnvReport,
  parseEnvTarget
} from "../lib/env-validation";

const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
const target = parseEnvTarget(targetArg?.split("=")[1] ?? "web");

console.log("Attn deployment readiness checklist");
console.log("");
console.log(formatEnvReport(getEnvReport(process.env, target)));
console.log("");
console.log("Sequence:");
console.log("1. Set backend env vars in the deploy platform.");
console.log("2. Deploy the app.");
console.log("3. Run `npm run migrate` from a trusted shell.");
console.log("4. Check `GET /api/health`.");
console.log("5. Run `npm run smoke:e2e` with ATTN_BASE_URL and ATTN_INGEST_TOKEN.");
console.log("6. Create a pairing code from a trusted backend/admin context.");
console.log("7. Pair the mobile device.");
console.log("8. Confirm diagnostics show safe statuses and active device count.");
console.log("9. Configure Novu and Expo/APNs/FCM credentials.");
console.log("10. Trigger one high-priority test item.");
console.log("");
console.log("This checklist does not run real Push verification.");
