package com.nullchannel.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.CompletableFuture;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** Call-scoped ICE lease. Never publishes credentials from an ended owner. */
final class NativeIceCredentials implements AutoCloseable {
    static final String PUBLIC_STUN = "stun:stun.l.google.com:19302";
    private final LongSupplier clock;
    private final Supplier<CompletableFuture<JSONObject>> fetch;
    private long expiresAt;
    private JSONArray servers;
    private CompletableFuture<JSONArray> pending;
    private CompletableFuture<JSONObject> source;
    private boolean closed;

    NativeIceCredentials(LongSupplier clock, Supplier<CompletableFuture<JSONObject>> fetch) {
        this.clock = clock;
        this.fetch = fetch;
    }

    synchronized CompletableFuture<JSONArray> fresh() {
        if (closed) return failed(new IllegalStateException("Call ended"));
        if (pending != null) return pending;
        if (servers != null && expiresAt > clock.getAsLong() + 30000) {
            return CompletableFuture.completedFuture(servers);
        }
        CompletableFuture<JSONArray> result = new CompletableFuture<>();
        pending = result;
        try {
            CompletableFuture<JSONObject> request = fetch.get();
            source = request;
            request.whenComplete((config, error) -> {
                synchronized (NativeIceCredentials.this) {
                    if (closed || pending != result) return;
                    pending = null;
                    source = null;
                    if (error != null) { result.completeExceptionally(error); return; }
                    try {
                        long expiry = Math.multiplyExact(config.getLong("expiresAt"), 1000L);
                        if (expiry <= clock.getAsLong()) throw new IllegalStateException("ICE lease expired");
                        JSONArray next = withStun(config.getJSONArray("iceServers"));
                        servers = next;
                        expiresAt = expiry;
                        result.complete(next);
                    } catch (Exception invalid) {
                        result.completeExceptionally(new IllegalStateException("Invalid ICE configuration"));
                    }
                }
            });
        } catch (Exception error) {
            pending = null;
            source = null;
            result.completeExceptionally(error);
        }
        return result;
    }

    static JSONArray withStun(JSONArray relay) throws Exception {
        JSONArray result = new JSONArray(relay.toString());
        for (int i = 0; i < result.length(); i++) {
            Object urls = result.getJSONObject(i).get("urls");
            if (PUBLIC_STUN.equals(urls)) return result;
            if (urls instanceof JSONArray) {
                JSONArray values = (JSONArray) urls;
                for (int j = 0; j < values.length(); j++) if (PUBLIC_STUN.equals(values.getString(j))) return result;
            }
        }
        result.put(new JSONObject().put("urls", PUBLIC_STUN));
        return result;
    }

    @Override public synchronized void close() {
        closed = true;
        servers = null;
        if (source != null) source.cancel(true);
        if (pending != null) pending.cancel(false);
        source = null;
        pending = null;
    }

    private static <T> CompletableFuture<T> failed(Exception error) {
        CompletableFuture<T> result = new CompletableFuture<>();
        result.completeExceptionally(error);
        return result;
    }
}
