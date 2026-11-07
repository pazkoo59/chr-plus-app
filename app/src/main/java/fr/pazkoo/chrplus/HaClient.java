package fr.pazkoo.chrplus;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Petit client REST Home Assistant pour le widget (hors de l'appli). */
final class HaClient {
    private final String base;
    private final String token;

    HaClient(String base, String token) {
        this.base = base.replaceAll("/+$", "");
        this.token = token;
    }

    static HaClient from(JSONObject cfg) {
        if (cfg == null) return null;
        String u = cfg.optString("url", ""), t = cfg.optString("token", "");
        if (u.isEmpty() || t.isEmpty()) return null;
        return new HaClient(u, t);
    }

    /** État d'une entité, ou null. */
    JSONObject state(String entityId) {
        if (entityId == null || entityId.isEmpty()) return null;
        try {
            String r = request("GET", "/api/states/" + entityId, null);
            return r == null ? null : new JSONObject(r);
        } catch (Exception e) {
            return null;
        }
    }

    boolean call(String domain, String service, JSONObject data) {
        try {
            return request("POST", "/api/services/" + domain + "/" + service, data.toString()) != null;
        } catch (Exception e) {
            return false;
        }
    }

    private String request(String method, String path, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(15_000);
        c.setRequestMethod(method);
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Content-Type", "application/json");
        if (body != null) {
            c.setDoOutput(true);
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code = c.getResponseCode();
        if (code < 200 || code >= 300) { c.disconnect(); return null; }
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }
}
