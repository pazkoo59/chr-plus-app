package fr.pazkoo.chrplus;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/** Ce que le widget doit savoir, enregistré par l'appli : connexion, entités, dernières valeurs. */
final class WidgetStore {
    private static final String PREFS = "chrplus_widget";

    private WidgetStore() { }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveConfig(Context c, String json) {
        prefs(c).edit().putString("config", json).apply();
    }

    static void saveSnapshot(Context c, String json) {
        prefs(c).edit().putString("snapshot", json).apply();
    }

    static JSONObject config(Context c) {
        return parse(prefs(c).getString("config", null));
    }

    static JSONObject snapshot(Context c) {
        return parse(prefs(c).getString("snapshot", null));
    }

    static void status(Context c, String msg) {
        prefs(c).edit().putString("status", msg).putLong("statusAt", System.currentTimeMillis()).apply();
    }

    /** Message d'action récent (moins de 2 min), sinon null. */
    static String recentStatus(Context c) {
        SharedPreferences p = prefs(c);
        if (System.currentTimeMillis() - p.getLong("statusAt", 0) > 120_000) return null;
        return p.getString("status", null);
    }

    private static JSONObject parse(String s) {
        if (s == null) return null;
        try { return new JSONObject(s); } catch (Exception e) { return null; }
    }
}
