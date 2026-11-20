import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: android/keystore.properties (git-ignored), see docs/PRODUCTION.md.
val keystore = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "np.vedicnepali.keyboard"
    compileSdk = 35

    defaultConfig {
        applicationId = "np.vedicnepali.keyboard"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (keystore.isNotEmpty()) create("release") {
            storeFile = rootProject.file(keystore.getProperty("storeFile"))
            storePassword = keystore.getProperty("storePassword")
            keyAlias = keystore.getProperty("keyAlias")
            keyPassword = keystore.getProperty("keyPassword")
        }
    }

    buildTypes {
        release {
            signingConfigs.findByName("release")?.let { signingConfig = it }
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/vedicnepali-assets"))
}

// One source of truth: schemes, dictionaries and the font are copied from the repo at build time.
val syncVedicNepaliAssets by tasks.registering(Copy::class) {
    val repo = rootDir.parentFile
    into(layout.buildDirectory.dir("generated/vedicnepali-assets/vedicnepali"))
    from(File(repo, "engine/transliteration/schemes")) { into("schemes") }
    from(File(repo, "engine/transliteration/layouts")) { into("layouts") }
    from(File(repo, "engine/suggestions/data")) { into("dictionaries") }
    from(File(repo, "engine/keyboards")) { into("keyboards") }
    from(File(repo, "font/builds/variable")) {
        include("VedicNepali[wght].ttf")
        rename { "VedicNepali-Variable.ttf" }
        into("fonts")
    }
}
tasks.named("preBuild") { dependsOn(syncVedicNepaliAssets) }

dependencies {
    implementation(project(":engine"))
    // Handwriting: on-device Nepali ink recognition. The model (~20 MB) is downloaded once, then works offline.
    implementation("com.google.mlkit:digital-ink-recognition:18.1.0")
}
