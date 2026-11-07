package fr.pazkoo.chrplus;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

public class MainActivity extends Activity {

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private static final int PICK_PHOTO = 42;
    /** Action demandée par un raccourci (appui long sur l'icône), récupérée par l'appli au démarrage. */
    private String pendingAction = null;

    private boolean isNight() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true; // avant Android 10 : thème sombre
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean night = isNight();
        int bg = Color.parseColor(night ? "#0E1116" : "#F3F5F8");

        Window w = getWindow();
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(Color.parseColor(night ? "#151A21" : "#FFFFFF"));

        WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setBackgroundColor(bg);

        // Android 15+ dessine l'appli sous les barres système (bord à bord) :
        // le cadre laisse la place aux barres et au clavier.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(night ? 0 : light, light);
            }
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        // L'appli (fichiers locaux) appelle l'API REST de Home Assistant pour installer les automatisations.
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "ChrAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                return true;
            }
        });

        // Choix d'une photo dans la galerie (<input type="file">)
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "Photo de la voiture"), PICK_PHOTO);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        pendingAction = actionFrom(getIntent());
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    /** chrplus://heat, chrplus://lock, chrplus://refresh (raccourcis et widget). */
    private static String actionFrom(Intent i) {
        if (i == null || i.getData() == null) return null;
        Uri d = i.getData();
        return "chrplus".equals(d.getScheme()) ? d.getHost() : null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String a = actionFrom(intent);
        if (a != null) web.evaluateJavascript("window.chrShortcut && window.chrShortcut(" + JSONObject.quote(a) + ")", null);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_PHOTO && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.evaluateJavascript("window.chrResume && window.chrResume()", null);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.chrBack ? window.chrBack() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    private void js(String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    /** Pont entre l'appli (JavaScript) et Android. */
    private class Bridge {
        @JavascriptInterface
        public String takePendingAction() {
            String a = pendingAction;
            pendingAction = null;
            return a == null ? "" : a;
        }

        /** Connexion + entités utiles au widget (JSON). */
        @JavascriptInterface
        public void saveWidgetConfig(String json) {
            WidgetStore.saveConfig(MainActivity.this, json);
        }

        /** Dernières valeurs affichées, pour le widget (JSON). */
        @JavascriptInterface
        public void pushSnapshot(String json) {
            WidgetStore.saveSnapshot(MainActivity.this, json);
            CarWidget.refreshAll(MainActivity.this);
        }

        @JavascriptInterface
        public boolean canAuthenticate() {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P;
        }

        /** Empreinte / code du téléphone. Réponse : window.chrAuthResult(id, "ok" | "fail" | "unavailable"). */
        @JavascriptInterface
        public void authenticate(String title, String id) {
            runOnUiThread(() -> authenticateOnUi(title, id));
        }
    }

    @SuppressWarnings("deprecation")
    private void authenticateOnUi(String title, String id) {
        String cb = "window.chrAuthResult && window.chrAuthResult(" + JSONObject.quote(id) + ",";
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) { js(cb + "'unavailable')"); return; }
        try {
            BiometricPrompt.Builder b = new BiometricPrompt.Builder(this)
                    .setTitle(title)
                    .setSubtitle("Confirme que c'est bien toi");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK
                        | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                b.setDeviceCredentialAllowed(true);
            } else {
                b.setNegativeButton("Annuler", getMainExecutor(), (d, w) -> js(cb + "'fail')"));
            }
            b.build().authenticate(new CancellationSignal(), getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    js(cb + "'ok')");
                }

                @Override
                public void onAuthenticationError(int code, CharSequence msg) {
                    boolean none = code == BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT
                            || code == BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE
                            || code == BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS
                            || code == BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL;
                    js(cb + (none ? "'unavailable')" : "'fail')"));
                }
            });
        } catch (Exception e) {
            js(cb + "'unavailable')");
        }
    }
}
