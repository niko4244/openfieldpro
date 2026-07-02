// Mobile twin of the web SponsorSlot: one honest, non-tracking line on the
// free plan; renders nothing on pro/business. Upgrading happens in the web
// app (Settings → General → Plan) — the banner just says so.
import { StyleSheet, Text, View } from "react-native";
import { planAtLeast } from "@ofp/shared";

export function SponsorBanner({ plan }: { plan: string | null }) {
  if (plan === null || planAtLeast(plan, "pro")) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        OpenFieldPro is free &amp; open source — Pro removes this line (web app → Settings).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#232c4d",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  text: { color: "#5a6382", fontSize: 12, textAlign: "center" },
});
