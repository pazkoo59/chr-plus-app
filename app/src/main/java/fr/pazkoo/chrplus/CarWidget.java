package fr.pazkoo.chrplus;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Widget d'écran d'accueil : batterie, autonomie, état de charge, boutons Préchauffer et Actualiser. */
public class CarWidget extends AppWidgetProvider {

    static final String ACTION_HEAT = "fr.pazkoo.chrplus.WIDGET_HEAT";
    static final String ACTION_REFRESH = "fr.pazkoo.chrplus.WIDGET_REFRESH";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        render(ctx, mgr, ids);
        background(ctx, () -> fetch(ctx));
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (ACTION_HEAT.equals(a)) {
            WidgetStore.status(ctx, "Préchauffage envoyé…");
            refreshAll(ctx);
            background(ctx, () -> {
                WidgetStore.status(ctx, heat(ctx) ? "🔥 Préchauffage lancé" : "⚠ Échec du préchauffage");
            });
        } else if (ACTION_REFRESH.equals(a)) {
            WidgetStore.status(ctx, "Actualisation…");
            refreshAll(ctx);
            background(ctx, () -> {
                JSONObject cfg = WidgetStore.config(ctx);
                HaClient ha = HaClient.from(cfg);
                if (ha != null && !cfg.optString("refresh").isEmpty()) {
                    ha.call("button", "press", new JSONObject().put("entity_id", cfg.optString("refresh")));
                }
                boolean ok = fetch(ctx);
                WidgetStore.status(ctx, ok ? null : "⚠ Home Assistant injoignable");
            });
        }
    }

    interface Job { void run() throws Exception; }

    /** Travail réseau hors du fil principal, puis redessine le widget. */
    private void background(Context ctx, Job job) {
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try { job.run(); } catch (Exception ignored) { }
            finally {
                refreshAll(ctx);
                pr.finish();
            }
        }).start();
    }

    /** Relit batterie, autonomie, charge et verrouillage via l'API REST. */
    static boolean fetch(Context ctx) {
        JSONObject cfg = WidgetStore.config(ctx);
        HaClient ha = HaClient.from(cfg);
        if (ha == null) return false;
        try {
            JSONObject snap = WidgetStore.snapshot(ctx);
            if (snap == null) snap = new JSONObject();
            JSONObject b = ha.state(cfg.optString("batt"));
            if (b == null) return false;
            snap.put("batt", b.optString("state"));
            JSONObject r = ha.state(cfg.optString("range"));
            if (r != null) snap.put("range", r.optString("state"));
            JSONObject ch = ha.state(cfg.optString("charge"));
            if (ch != null) snap.put("charge", ch.optString("state"));
            JSONObject l = ha.state(cfg.optString("lock"));
            if (l != null) snap.put("lock", l.optString("state"));
            snap.put("t", System.currentTimeMillis());
            WidgetStore.saveSnapshot(ctx, snap.toString());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Même logique que le bouton « Lancer » de l'appli. */
    static boolean heat(Context ctx) throws Exception {
        JSONObject cfg = WidgetStore.config(ctx);
        HaClient ha = HaClient.from(cfg);
        String climate = cfg == null ? "" : cfg.optString("climate");
        if (ha == null || climate.isEmpty()) return false;
        double temp = 21;
        JSONObject t = ha.state(cfg.optString("target"));
        if (t != null) { try { temp = Double.parseDouble(t.optString("state")); } catch (Exception ignored) { } }
        else {
            JSONObject cl = ha.state(climate);
            if (cl != null && cl.optJSONObject("attributes") != null) temp = cl.optJSONObject("attributes").optDouble("temperature", 21);
        }
        boolean ok = ha.call("climate", "set_temperature", new JSONObject().put("entity_id", climate).put("temperature", Math.round(temp)));
        if (cfg.optBoolean("presets")) {
            JSONObject d = ha.state(cfg.optString("defrost"));
            String preset = presetFor(d == null ? "" : d.optString("state"));
            if (preset != null) ha.call("climate", "set_preset_mode", new JSONObject().put("entity_id", climate).put("preset_mode", preset));
        }
        ok &= ha.call("climate", "set_hvac_mode", new JSONObject().put("entity_id", climate).put("hvac_mode", cfg.optString("hvacOn", "heat_cool")));
        return ok;
    }

    private static String presetFor(String defrost) {
        switch (defrost) {
            case "Aucun": return "none";
            case "Pare-brise": return "front_defrost";
            case "Lunette arrière": return "rear_defrost";
            case "Avant + arrière": return "both_defrost";
            default: return null; // « Auto » ou inconnu : on ne touche pas au dégivrage
        }
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, CarWidget.class));
        if (ids.length > 0) render(ctx, mgr, ids);
    }

    private static PendingIntent self(Context ctx, String action, int code) {
        Intent i = new Intent(ctx, CarWidget.class).setAction(action);
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void render(Context ctx, AppWidgetManager mgr, int[] ids) {
        JSONObject s = WidgetStore.snapshot(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_car);
        if (s == null) {
            v.setTextViewText(R.id.w_name, "CHR+");
            v.setTextViewText(R.id.w_batt, "—");
            v.setTextViewText(R.id.w_range, "Ouvre l'appli une fois");
            v.setTextViewText(R.id.w_status, "");
            v.setProgressBar(R.id.w_bar, 100, 0, false);
        } else {
            String b = s.optString("batt", "—");
            int pct = 0;
            try { pct = (int) Math.round(Double.parseDouble(b)); b = pct + " %"; } catch (Exception ignored) { }
            v.setTextViewText(R.id.w_name, s.optString("name", "CHR+") + ("locked".equals(s.optString("lock")) ? "  🔒" : "unlocked".equals(s.optString("lock")) ? "  🔓" : ""));
            v.setTextViewText(R.id.w_batt, b);
            String range = s.optString("range", "");
            try { range = Math.round(Double.parseDouble(range)) + " km"; } catch (Exception e) { range = ""; }
            v.setTextViewText(R.id.w_range, range);
            v.setProgressBar(R.id.w_bar, 100, pct, false);
            String st = WidgetStore.recentStatus(ctx);
            if (st == null) {
                String when = s.has("t") ? new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date(s.optLong("t"))) : "";
                st = chargeLabel(s.optString("charge")) + (when.isEmpty() ? "" : " · " + when);
            }
            v.setTextViewText(R.id.w_status, st);
        }
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        v.setOnClickPendingIntent(R.id.w_heat, self(ctx, ACTION_HEAT, 2));
        v.setOnClickPendingIntent(R.id.w_refresh, self(ctx, ACTION_REFRESH, 3));
        mgr.updateAppWidget(ids, v);
    }

    private static String chargeLabel(String s) {
        switch (s) {
            case "charging": return "⚡ En charge";
            case "plugged": return "🔌 Branchée";
            case "charge_complete": return "✅ Charge terminée";
            case "none": return "Débranchée";
            default: return "";
        }
    }
}
