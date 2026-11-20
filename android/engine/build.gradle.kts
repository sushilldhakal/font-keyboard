// Pure Kotlin port of engine/ (TypeScript reference). No Android dependency, so it is unit-tested
// on the JVM against the shared vectors in ../../tests/vectors.
plugins {
    id("org.jetbrains.kotlin.jvm")
}

kotlin { jvmToolchain(17) }

dependencies {
    compileOnly("org.json:json:20240303") // provided by Android at runtime
    testImplementation("org.json:json:20240303")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
    systemProperty("vedicnepali.root", rootDir.parentFile.absolutePath)
}
