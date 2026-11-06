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
        versionName = "1.0.$buildNumber"
    }

    // Clé de signature fixe : les mises à jour s'installent par-dessus l'ancienne version
    // sans devoir désinstaller. Garde le dépôt privé.
    signingConfigs {
        create("perso") {
            storeFile = file("chrplus.jks")
            storePassword = "chrplus-app"
            keyAlias = "chrplus"
            keyPassword = "chrplus-app"
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
