plugins {
    id("com.android.application")
}

val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "fr.pazkoo.chrplus"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.pazkoo.chrplus"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.2.$buildNumber"
    }

    // Clé de signature fixe, fournie par le secret GitHub KEYSTORE_B64 (décodé dans app/release.jks
    // par le workflow). Elle n'est jamais dans le dépôt : les mises à jour s'installent par-dessus.
    val storePass = System.getenv("SIGNING_PASSWORD")?.takeIf { it.isNotBlank() } ?: "chrplus-app"
    signingConfigs {
        create("perso") {
            storeFile = file("release.jks")
            storePassword = storePass
            keyAlias = System.getenv("SIGNING_ALIAS")?.takeIf { it.isNotBlank() } ?: "chrplus"
            keyPassword = storePass
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("perso")
        }
        debug {
            signingConfig = signingConfigs.getByName("perso")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
