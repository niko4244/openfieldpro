import { useCallback, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  NativeRequestError,
  nativeLogin,
  type NativeSession,
} from "./src/auth";
import { FieldDashboard } from "./src/FieldDashboard";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

function apiLabel() {
  try {
    return new URL(API).origin;
  } catch {
    return API;
  }
}

export default function App() {
  const [session, setSession] = useState<NativeSession | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expireSession = useCallback((message: string) => {
    setSession(null);
    setPassword("");
    setError(message);
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    setPassword("");
    setError("Signed out. Your downloaded field packages remain isolated to your account.");
  }, []);

  async function submitLogin() {
    if (!email.trim() || !password) {
      setError("Enter your individual OpenFieldPro email and password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const nextSession = await nativeLogin(API, email, password);
      setPassword("");
      setSession(nextSession);
    } catch (caught) {
      setPassword("");
      setError(
        caught instanceof NativeRequestError && caught.status === 401
          ? "Sign-in failed. Verify your email and password."
          : caught instanceof Error
            ? caught.message
            : "Sign-in failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (session) {
    return (
      <SafeAreaView style={styles.appContainer}>
        <FieldDashboard
          apiUrl={API}
          session={session}
          onSessionExpired={expireSession}
          onSignOut={signOut}
        />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.appContainer}>
      <KeyboardAvoidingView
        style={styles.loginContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.loginCard}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>OF</Text>
          </View>
          <Text style={styles.eyebrow}>OPENFIELDPRO FIELD</Text>
          <Text style={styles.title}>Secure technician sign-in</Text>
          <Text style={styles.description}>
            Use your individual team account. Shared build-time credentials are no longer accepted by the field app.
          </Text>

          <View style={styles.securityPanel}>
            <Text style={styles.securityTitle}>SESSION SECURITY</Text>
            <Text style={styles.securityText}>
              Your bearer token stays only in app memory. Sign-in is required again after the app restarts. Downloaded field packages are stored in a database isolated to your organization and user ID.
            </Text>
          </View>

          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="technician@example.com"
            placeholderTextColor="#5f6d91"
            returnKeyType="next"
            style={styles.input}
            textContentType="username"
            value={email}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            onChangeText={setPassword}
            onSubmitEditing={() => void submitLogin()}
            placeholder="Password"
            placeholderTextColor="#5f6d91"
            returnKeyType="go"
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in securely"
            disabled={submitting}
            onPress={() => void submitLogin()}
            style={({ pressed }) => [
              styles.loginButton,
              (pressed || submitting) && styles.buttonPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign in securely</Text>
            )}
          </Pressable>

          {error && (
            <View accessibilityLiveRegion="polite" style={styles.errorPanel}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.apiText}>API: {apiLabel()}</Text>
        </View>
      </KeyboardAvoidingView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appContainer: { flex: 1, backgroundColor: "#0b1020" },
  loginContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  loginCard: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#202a48",
    backgroundColor: "#141b33",
    padding: 22,
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f67ff",
    marginBottom: 18,
  },
  logoText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  eyebrow: { color: "#22c55e", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  title: {
    color: "#e6e9f0",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 8,
  },
  description: { color: "#9aa6c3", fontSize: 13, lineHeight: 20, marginTop: 10 },
  securityPanel: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,.28)",
    backgroundColor: "rgba(34,197,94,.07)",
    padding: 13,
    marginTop: 20,
    marginBottom: 22,
  },
  securityTitle: { color: "#86e29a", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  securityText: { color: "#aab4d0", fontSize: 11, lineHeight: 17, marginTop: 6 },
  label: { color: "#aab4d0", fontSize: 11, fontWeight: "700", marginBottom: 7 },
  input: {
    height: 50,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2a3555",
    backgroundColor: "#0f1630",
    color: "#e6e9f0",
    fontSize: 14,
    paddingHorizontal: 14,
    marginBottom: 17,
  },
  loginButton: {
    height: 52,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f67ff",
    marginTop: 3,
  },
  buttonPressed: { opacity: 0.72 },
  loginButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  errorPanel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,128,128,.28)",
    backgroundColor: "rgba(255,128,128,.08)",
    padding: 11,
    marginTop: 14,
  },
  errorText: { color: "#ff9baa", fontSize: 11, lineHeight: 16 },
  apiText: { color: "#5f6d91", fontSize: 9, marginTop: 16, textAlign: "center" },
});
