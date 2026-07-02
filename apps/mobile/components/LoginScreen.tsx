// Sign-in screen for the technician app. Matches the dark dashboard styling.
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { login, type SessionUser } from "../src/api";

export function LoginScreen({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onLogin(await login(email.trim(), password));
    } catch {
      setError("Sign-in failed. Check your email and password.");
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>⊹ OpenFieldPro</Text>
        <Text style={styles.subtitle}>Technician sign-in</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#5a6382"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#5a6382"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, (busy || !email || !password) && styles.buttonDisabled]}
          onPress={submit}
          disabled={busy || !email || !password}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#141a30",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#232c4d",
  },
  logo: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#8b93b8",
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 24,
  },
  input: {
    backgroundColor: "#0e1428",
    borderWidth: 1,
    borderColor: "#232c4d",
    borderRadius: 10,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  error: {
    color: "#f28b82",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#3b56b0",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
