plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Set these with -PHARBOR_SUPABASE_URL=... -PHARBOR_SUPABASE_ANON_KEY=... or as environment variables.
// The anon key is meant to ship in apps (row level security protects the data), but it stays out of git.
fun setting(name: String, fallback: String): String =
    ((project.findProperty(name) as String?) ?: System.getenv(name))?.takeIf { it.isNotBlank() } ?: fallback

val supabaseUrl = setting("HARBOR_SUPABASE_URL", "https://your-project.supabase.co")
val supabaseKey = setting("HARBOR_SUPABASE_ANON_KEY", "your-anon-key")

android {
    namespace = "app.harbor.tech"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.harbor.tech"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "0.1.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_KEY", "\"$supabaseKey\"")
    }

    // Sign with a stable key when the CI secrets are set, so new builds install over old ones.
    val ks = System.getenv("HARBOR_KEYSTORE_FILE")
    if (ks != null && file(ks).exists()) {
        signingConfigs {
            create("release") {
                storeFile = file(ks)
                storePassword = System.getenv("HARBOR_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HARBOR_KEY_ALIAS")
                keyPassword = System.getenv("HARBOR_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.02")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.fragment:fragment-ktx:1.8.3")   // osmdroid pulls an old fragment; activity results need 1.3+
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("org.osmdroid:osmdroid-android:6.1.18")
}
