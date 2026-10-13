import Foundation

/* The languages a fence can name, as data. A spec is built on first use
 * and cached; naming a language this file doesn't know highlights
 * nothing, which still reads fine in Ioskeley on a sunk fill. */
enum Languages {
  nonisolated(unsafe) private static var cache: [String: LanguageSpec] = [:]
  private static let lock = NSLock()

  /* Which specs have been built this run — tests pin that nothing loads
   * until a fence asks for it. */
  static var loaded: [String] { lock.withLock { cache.keys.sorted() } }

  static func spec(for name: String) -> LanguageSpec? {
    guard let id = canonical[name.lowercased()] else { return nil }
    return lock.withLock {
      if let hit = cache[id] { return hit }
      guard let make = builders[id] else { return nil }
      let spec = make()
      cache[id] = spec
      return spec
    }
  }

  static let canonical: [String: String] = {
    var m: [String: String] = [:]
    for (id, aliases) in [
      ("javascript", ["js", "jsx", "mjs", "cjs", "typescript", "ts", "tsx"]),
      ("python", ["py"]), ("ruby", ["rb"]), ("go", []), ("rust", ["rs"]), ("swift", []),
      ("java", []), ("kotlin", ["kt", "kts"]), ("c", ["h", "cpp", "c++", "cc", "hpp", "objc", "objective-c"]),
      ("csharp", ["cs", "c#"]), ("php", []), ("shell", ["sh", "bash", "zsh", "shellscript", "console"]),
      ("json", ["jsonc"]), ("yaml", ["yml"]), ("toml", []), ("css", ["scss", "less"]),
      ("html", ["xml", "svg", "vue", "svelte"]), ("sql", []), ("markdown", ["md"])
    ] {
      m[id] = id
      for a in aliases { m[a] = id }
    }
    return m
  }()

  private static let builders: [String: @Sendable () -> LanguageSpec] = [
    "javascript": { LanguageSpec(keywords: "async await break case catch class const continue debugger default delete do else enum export extends finally for from function if implements import in instanceof interface let new of package private protected public return static super switch this throw try type typeof var void while with yield as declare readonly namespace abstract keyof".split(separator: " ").map(String.init), constants: ["true", "false", "null", "undefined", "NaN", "Infinity"]) },
    "python": { LanguageSpec(keywords: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self".split(separator: " ").map(String.init), constants: ["True", "False", "None"], lineComments: ["#"], blockComment: nil, stringDelimiters: ["\"", "'"]) },
    "ruby": { LanguageSpec(keywords: "alias and begin break case class def defined? do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield attr_accessor attr_reader require include".split(separator: " ").map(String.init), constants: ["true", "false", "nil"], lineComments: ["#"], blockComment: ("=begin", "=end"), stringDelimiters: ["\"", "'", "`"]) },
    "go": { LanguageSpec(keywords: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(separator: " ").map(String.init), constants: ["true", "false", "nil", "iota"]) },
    "rust": { LanguageSpec(keywords: "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while".split(separator: " ").map(String.init), constants: ["true", "false", "None", "Some", "Ok", "Err"], stringDelimiters: ["\""]) },
    "swift": { LanguageSpec(keywords: "actor as associatedtype async await break case catch class continue default defer deinit do else enum extension fallthrough fileprivate final for func guard if import in indirect init inout internal is lazy let mutating nonisolated nonmutating open operator override private protocol public repeat required rethrows return self Self some static struct subscript super switch throw throws try typealias var weak where while any".split(separator: " ").map(String.init), constants: ["true", "false", "nil"]) },
    "java": { LanguageSpec(keywords: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try var void volatile while record sealed permits yield".split(separator: " ").map(String.init), constants: ["true", "false", "null"]) },
    "kotlin": { LanguageSpec(keywords: "abstract actual annotation as break by catch class companion const constructor continue crossinline data do dynamic else enum expect external final finally for fun get if import in infix init inline inner interface internal is lateinit noinline object open operator out override package private protected public reified return sealed set super suspend tailrec this throw try typealias val var vararg when where while".split(separator: " ").map(String.init), constants: ["true", "false", "null"]) },
    "c": { LanguageSpec(keywords: "auto break case char class const constexpr continue default delete do double else enum explicit export extern float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register return short signed sizeof static struct switch template this throw try typedef typename union unsigned using virtual void volatile while bool override final include define ifdef ifndef endif pragma".split(separator: " ").map(String.init), constants: ["true", "false", "NULL", "nullptr"]) },
    "csharp": { LanguageSpec(keywords: "abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly record ref return sbyte sealed short sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while yield".split(separator: " ").map(String.init), constants: ["true", "false", "null"]) },
    "php": { LanguageSpec(keywords: "abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include instanceof insteadof interface isset list match namespace new or print private protected public readonly require return static switch throw trait try unset use var while xor yield".split(separator: " ").map(String.init), constants: ["true", "false", "null", "TRUE", "FALSE", "NULL"], lineComments: ["//", "#"]) },
    "shell": { LanguageSpec(keywords: "if then else elif fi for while until do done case esac in function select time coproc export local readonly declare unset shift source alias cd echo exit return set trap eval exec".split(separator: " ").map(String.init), constants: ["true", "false"], lineComments: ["#"], blockComment: nil, stringDelimiters: ["\"", "'", "`"]) },
    "json": { LanguageSpec(keywords: [], constants: ["true", "false", "null"], lineComments: ["//"], blockComment: ("/*", "*/"), stringDelimiters: ["\""]) },
    "yaml": { LanguageSpec(keywords: [], constants: ["true", "false", "null", "yes", "no", "~"], lineComments: ["#"], blockComment: nil, stringDelimiters: ["\"", "'"]) },
    "toml": { LanguageSpec(keywords: [], constants: ["true", "false"], lineComments: ["#"], blockComment: nil, stringDelimiters: ["\"", "'"]) },
    "css": { LanguageSpec(keywords: "important media supports import font-face keyframes".split(separator: " ").map(String.init), constants: [], lineComments: [], blockComment: ("/*", "*/"), stringDelimiters: ["\"", "'"]) },
    "html": { LanguageSpec(keywords: [], constants: [], lineComments: [], blockComment: ("<!--", "-->"), stringDelimiters: ["\"", "'"], tagsAreKeywords: true) },
    "sql": { LanguageSpec(keywords: "select from where insert into values update set delete create table drop alter add index view as join inner left right full outer on group by order having limit offset union all distinct and or not in is like between exists case when then else end primary key foreign references default unique check constraint begin commit rollback transaction with returning".split(separator: " ").map(String.init), constants: ["true", "false", "null"], lineComments: ["--"], blockComment: ("/*", "*/"), stringDelimiters: ["'"], caseInsensitive: true) },
    "markdown": { LanguageSpec(keywords: [], constants: [], lineComments: [], blockComment: ("<!--", "-->"), stringDelimiters: []) }
  ]
}
