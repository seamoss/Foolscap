# Foolscap (native)

The Swift/AppKit port of [Foolscap](https://github.com/seamoss/Foolscap),
a markdown editor for macOS: free, open source, file-first, and
unreasonably well-typeset. The Electron app keeps shipping until this one
reaches parity; PLAN.md has the phases.

## Building

```
brew install xcodegen
make project   # generates Foolscap.xcodeproj (not committed)
make run
make test      # unit tests + golden fixtures
make uitest    # XCUITest smoke suite
```

Requires Xcode 26 and macOS 14 or later.

## License

[MIT](LICENSE)
