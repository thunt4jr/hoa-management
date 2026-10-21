import { defineStorage } from "@aws-amplify/backend";

// No user access grants until recipient-aware file authorization is implemented.
export const storage = defineStorage({
  name: "communityPrivateFiles",
  versioned: true,
  keepOnDelete: true,
});
