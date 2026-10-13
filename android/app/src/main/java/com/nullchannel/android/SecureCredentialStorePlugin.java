package com.nullchannel.android;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureCredentialStore")
public final class SecureCredentialStorePlugin extends Plugin {
    private static final String KEY_ALIAS = "com.nullchannel.android.mobile-credentials.v1";
    private static final String PREFS = "nullchannel_secure_credentials";
    private static final int MAX_VALUE_LENGTH = 16384;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (!validKey(key) || value == null || value.length() > MAX_VALUE_LENGTH) {
            call.reject("Invalid secure credential value.");
            return;
        }
        executor.execute(() -> {
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, loadOrCreateKey());
                byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
                byte[] iv = cipher.getIV();
                byte[] packed = Arrays.copyOf(iv, iv.length + encrypted.length);
                System.arraycopy(encrypted, 0, packed, iv.length, encrypted.length);
                boolean saved = getContext().getSharedPreferences(PREFS, 0).edit()
                    .putString(key, Base64.encodeToString(packed, Base64.NO_WRAP)).commit();
                if (!saved) {
                    call.reject("Secure storage is unavailable.");
                    return;
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("Secure storage is unavailable.");
            }
        });
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (!validKey(key)) {
            call.reject("Invalid secure credential key.");
            return;
        }
        executor.execute(() -> {
            try {
                String stored = getContext().getSharedPreferences(PREFS, 0).getString(key, null);
                JSObject result = new JSObject();
                if (stored != null) {
                    byte[] packed = Base64.decode(stored, Base64.NO_WRAP);
                    if (packed.length > 12 && packed.length <= 12 + MAX_VALUE_LENGTH) {
                        byte[] iv = Arrays.copyOfRange(packed, 0, 12);
                        byte[] encrypted = Arrays.copyOfRange(packed, 12, packed.length);
                        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                        cipher.init(Cipher.DECRYPT_MODE, loadOrCreateKey(), new GCMParameterSpec(128, iv));
                        result.put("value", new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8));
                    }
                }
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Secure storage is unavailable.");
            }
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (!validKey(key)) {
            call.reject("Invalid secure credential key.");
            return;
        }
        executor.execute(() -> {
            try {
                boolean removed = getContext().getSharedPreferences(PREFS, 0).edit().remove(key).commit();
                if (!removed) {
                    call.reject("Secure storage is unavailable.");
                    return;
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("Secure storage is unavailable.");
            }
        });
    }

    private boolean validKey(String key) {
        return key != null && key.matches("[a-zA-Z0-9._-]{1,80}");
    }

    private SecretKey loadOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }
}
