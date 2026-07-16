/**
 * Config plugin: remove the iOS push-notification entitlement.
 *
 * expo-notifications automatically injects an `aps-environment` entitlement.
 * Free (Personal Team) Apple IDs cannot sign apps that request the Push
 * Notifications capability, so that entitlement makes `expo prebuild` + a
 * free-signing Xcode build fail with:
 *
 *   "Personal development teams ... do not support the Push Notifications
 *    capability."
 *
 * This app doesn't currently use remote push (the notification service is
 * local-only and not wired into the UI), so we strip the entitlement back
 * out after expo-notifications adds it. If real push is added later and the
 * project moves to a paid Apple Developer account, remove this plugin.
 */

const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    if (cfg.modResults && "aps-environment" in cfg.modResults) {
      delete cfg.modResults["aps-environment"];
    }
    return cfg;
  });
};
