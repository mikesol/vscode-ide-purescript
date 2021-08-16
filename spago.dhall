{-
Welcome to a Spago project!
You can edit this file as you like.
-}
{ name = "vscode-ide-purescript"
, dependencies =
  [ "aff"
  , "aff-promise"
  , "arrays"
  , "console"
  , "debug"
  , "effect"
  , "either"
  , "foldable-traversable"
  , "foreign"
  , "foreign-object"
  , "language-server"
  , "maybe"
  , "nullable"
  , "prelude"
  , "psc-ide"
  , "psci-support"
  , "pursuit-lookup"
  , "strings"
  , "transformers"
  , "tuples"
  ]
, packages = ./packages.dhall
, sources = [ "src/**/*.purs", "test/**/*.purs" ]
}
