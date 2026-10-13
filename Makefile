# Foolscap native. The Xcode project is generated, never committed.
SCHEME = Foolscap
DD = DerivedData
XC = xcodebuild -project Foolscap.xcodeproj -scheme $(SCHEME) -derivedDataPath $(DD) -configuration Debug
QUIET = 2>&1 | grep -E "error:|warning: .*Foolscap|BUILD|TEST|Test Case .* (passed|failed)|Executed" | grep -v "appintentsmetadataprocessor" || true

.PHONY: project build run test uitest clean

project:
	xcodegen generate --quiet

Foolscap.xcodeproj: project.yml
	xcodegen generate --quiet

build: Foolscap.xcodeproj
	$(XC) build $(QUIET)

run: build
	open $(DD)/Build/Products/Debug/Foolscap.app

# UPDATE_GOLDENS=1 make test regenerates fixtures/golden (xcodebuild forwards
# TEST_RUNNER_-prefixed variables into the test process).
test: Foolscap.xcodeproj
	TEST_RUNNER_UPDATE_GOLDENS=$(UPDATE_GOLDENS) $(XC) test -only-testing:FoolscapTests $(QUIET)

uitest: Foolscap.xcodeproj
	$(XC) test -only-testing:FoolscapUITests $(QUIET)

clean:
	rm -rf $(DD) build Foolscap.xcodeproj
