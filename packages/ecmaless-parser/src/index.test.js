var _ = require("lodash");
var test = require("tape");
var rmLoc = require("./rmLoc");
var parser = require("./");

var mk = {};
mk.num = function(value){
    return {type: "Number", value: value};
};
mk.str = function(value){
    return {type: "String", value: value};
};
mk.docstr = function(value){
    return {type: "Docstring", value: value};
};
mk.id = function(value){
    return {type: "Identifier", value: value};
};
mk.sym = function(value){
    return {type: "Symbol", value: value};
};
mk.def = function(id, init){
    return {type: "Define", id: id, init: init};
};
mk.block = function(body){
    return {type: "Block", body: body};
};
mk.fn = function(params, body){
    return {type: "Function", params: params, block: mk.block(body)};
};
mk.app = function(callee, args){
    return {type: "Application", callee: callee, args: args};
};
mk.arr = function(value){
    return {type: "Array", value: value};
};
mk.struct = function(value){
    return {type: "Struct", value: value};
};
mk.mem = function(method, object, path){
    return {type: "MemberExpression", object: object, path: path, method: method};
};
mk.ternary = function(test, consequent, alternate){
    return {
        type: "ConditionalExpression",
        test: test,
        consequent: consequent,
        alternate: alternate
    };
};
mk.unary = function(op, arg){
    return {
        type: "UnaryOperator",
        op: op,
        arg: arg
    };
};
mk.infix = function(op, left, right){
    return {
        type: "InfixOperator",
        op: op,
        left: left,
        right: right
    };
};
mk.assign = function(op, left, right){
    return {
        type: "AssignmentExpression",
        op: op,
        left: left,
        right: right
    };
};
mk.stmt = function(e){
    return {type: "ExpressionStatement", expression: e};
};
mk.ret = function(e){
    return {type: "Return", expression: e};
};

mk.Type = function(t, params){
    return {
        type: "Type",
        value: t,
        params: _.map(params, function(param){
            if(!_.isString(param)){
                return param;
            }
            return {
                type: "TypeVariable",
                value: param,
            };
        }),
    };
};

var mkv = function(v){
    if(_.isNumber(v)){
        return mk.num(v);
    }else if(_.isString(v)){
        return mk.str(v);
    }else if(_.isPlainObject(v)){
        return mk.struct(_.flatten(_.map(v, function(v, k){
            return [mkv(k + ""), v];
        })));
    }else if(_.isArray(v)){
        return mk.arr(v);
    }
    return v;
};

test("parser", function(t){
    var tst = function(src, expected){
        var ast = parser(src);
        ast = _.isArray(ast) && _.size(ast) === 1 ? _.head(ast) : ast;
        if(ast.type === "ExpressionStatement"){
            ast = ast.expression;
        }
        t.deepEquals(rmLoc(ast), expected);
    };
    var tstFail = function(src){
        try{
            parser(src);
            t.ok(false, "This should have thrown a parsing exception");
        }catch(e){
            t.ok(true);
        }
    };

    tst("123", mk.num(123));
    tst("\"ok\"", mk.str("ok"));
    tst("\"one\\ntwo\"", mk.str("one\ntwo"));
    tst("\"one\\ttwo\"", mk.str("one\ttwo"));
    tstFail("\"\\\"that\\\"\n\"");
    tst("\"\"\"\nsome \"docstring\"\n\"\"\"", mk.docstr("\nsome \"docstring\"\n"));

    tst("def a = 1.2", mk.def(mk.id("a"), mk.num(1.2)));

    tst("[]", mk.arr([]));
    tstFail("[,]");
    tst("[1, 2, 3]", mk.arr([mk.num(1), mk.num(2), mk.num(3)]));
    tstFail("[1, 2, 3,]");
    tst("[\n    1,\n    2,\n    3,\n]", mk.arr([mk.num(1), mk.num(2), mk.num(3)]));
    tstFail("[\n    1,\n2,    \n    3,,\n]", mk.arr([mk.num(1), mk.num(2), mk.num(3)]));
    tstFail("[,1, 2, 3]");

    tst("{}", mkv({}));
    tst("{a: 1}", mk.struct([mk.sym("a"), mkv(1)]));
    tstFail("{a: 1,}");
    tst("{def: 1}", mk.struct([mk.sym("def"), mkv(1)]));
    tstFail("{1: 1}");
    tst("{\n    a: \"a\",\n}", mk.struct([mk.sym("a"), mkv("a")]));
    tst("{\n    a: \"a\",\n    b: \"b\",\n}", mk.struct([
        mk.sym("a"), mkv("a"),
        mk.sym("b"), mkv("b")
    ]));

    var fn_body_a = [mk.stmt(mk.id("a"))];
    tstFail("fn \n    a");
    tstFail("fn []\n    a");
    tstFail("fn ()\n    a");
    tstFail("fn args:\n    a");
    tst("fn ():\n    a", mk.fn([], fn_body_a));
    tst("fn():\n    a", mk.fn([], fn_body_a));
    tst("fn():\n\n    a", mk.fn([], fn_body_a));
    tst("fn (  ) :\n    a", mk.fn([], fn_body_a));
    tstFail("fn (,):\n    a");
    tstFail("fn (1):\n    a");
    tstFail("fn (1, 2):\n    a");
    tst("fn (a):\n    a", mk.fn([mk.id("a")], fn_body_a));
    tst("fn (a,):\n    a", mk.fn([mk.id("a")], fn_body_a));
    tst("fn (a, b):\n    a", mk.fn([mk.id("a"), mk.id("b")], fn_body_a));
    tst("fn (a,b,):\n    a", mk.fn([mk.id("a"), mk.id("b")], fn_body_a));

    tst("a(\n    fn():\n        b\n    ,\n)", mk.app(mk.id("a"), [
        mk.fn([], [mk.stmt(mk.id("b"))])
    ]));
    tst("a(\n    1,\n    fn():\n        b\n    ,\n)", mk.app(mk.id("a"), [
        mkv(1),
        mk.fn([], [mk.stmt(mk.id("b"))])
    ]));
    tst("a(\n    fn():\n        b\n    ,\n    1,\n)", mk.app(mk.id("a"), [
        mk.fn([], [mk.stmt(mk.id("b"))]),
        mkv(1)
    ]));
    tst("a(\n    1,\n    fn():\n        b\n    ,\n    2,\n)", mk.app(mk.id("a"), [
        mkv(1),
        mk.fn([], [mk.stmt(mk.id("b"))]),
        mkv(2)
    ]));

    tst("add()", mk.app(mk.id("add"), []));
    tst("add();test", mk.app(mk.id("add"), []));
    tst("add()\n;test", mk.app(mk.id("add"), []));
    tstFail("add(,)");
    tst("add(1, 2)", mk.app(mk.id("add"), [mkv(1), mkv(2)]));
    tstFail("add(1, 2,)");
    tst("add(\n    1,\n    2,\n)", mk.app(mk.id("add"), [mkv(1), mkv(2)]));
    tst("add  (1)", mk.app(mk.id("add"), [mkv(1)]));

    tst("(1)", mkv(1));

    tst("a.b.c", mk.mem("dot", mk.mem("dot", mk.id("a"), mk.sym("b")), mk.sym("c")));
    tst("a[b][0]", mk.mem("index", mk.mem("index", mk.id("a"), mk.id("b")), mkv(0)));

    tst("a?1:2", mk.ternary(mk.id("a"), mkv(1), mkv(2)));
    tst("a ? 1 : 2", mk.ternary(mk.id("a"), mkv(1), mkv(2)));
    //Don't nest these without parans!
    tstFail("1?2?3:4:5");
    tstFail("1?2:3?4:5");
    tst("1?2:(3?4:5)", mk.ternary(mkv(1), mkv(2), mk.ternary(mkv(3), mkv(4), mkv(5))));

    _.each([
        "or",
        "and",
        "==",
        "!=",
        "+",
        "-",
        "*",
        "/",
        "%",
        "<",
        "<=",
        ">",
        ">=",
    ], function(op){
        tst("1 " + op + " 2", mk.infix(op, mkv(1), mkv(2)));
    });

    tst("\"hello \" ++ name", mk.infix("++", mkv("hello "), mk.id("name")));

    tst("while a:\n    b", {
        type: "While",
        test: mk.id("a"),
        block: mk.block([mk.stmt(mk.id("b"))])
    });
    tst("break", {type: "Break"});
    tst("continue", {type: "Continue"});

    var src = "";
    src += "case a:\n";
    src += "    1:\n";
    src += "        b\n";
    src += "    2:\n";
    src += "        c\n";
    tst(src, {
        type: "Case",
        to_test: mk.id("a"),
        blocks: [
            {type: "CaseBlock", value: mkv(1), block: mk.block([mk.stmt(mk.id("b"))])},
            {type: "CaseBlock", value: mkv(2), block: mk.block([mk.stmt(mk.id("c"))])}
        ],
    });

    src = "";
    src += "if a:\n";
    src += "    b\n";
    tst(src, {
        type: "If",
        test: mk.id("a"),
        then: mk.block([mk.stmt(mk.id("b"))]),
        "else": null
    });
    src = "";
    src += "if a:\n";
    src += "    b\n";
    src += "else:\n";
    src += "    c\n";
    tst(src, {
        type: "If",
        test: mk.id("a"),
        then: mk.block([mk.stmt(mk.id("b"))]),
        "else": mk.block([mk.stmt(mk.id("c"))])
    });
    src = "";
    src += "if a:\n";
    src += "    b\n";
    src += "else if c:\n";
    src += "    d\n";
    src += "else:\n";
    src += "    e\n";
    tst(src, {
        type: "If",
        test: mk.id("a"),
        then: mk.block([mk.stmt(mk.id("b"))]),
        "else": {
            type: "If",
            test: mk.id("c"),
            then: mk.block([mk.stmt(mk.id("d"))]),
            "else": mk.block([mk.stmt(mk.id("e"))])
        }
    });

    tst("-1", mk.unary("-", mkv(1)));
    tst("+1", mk.unary("+", mkv(1)));
    tst("not a", mk.unary("not", mk.id("a")));
    tst("3- -1", mk.infix("-", mkv(3), mk.unary("-", mkv(1))));

    tst("i = 1", mk.assign("=", mk.id("i"), mkv(1)));
    tst("a[i] = 1 + 1", mk.assign("=",
        mk.mem("index", mk.id("a"), mk.id("i")),
        mk.infix("+", mkv(1), mkv(1))
    ));
    tst("i = j = 0", mk.assign("=", mk.id("i"), mk.assign("=", mk.id("j"), mkv(0))));

    tst("return", mk.ret(null));
    tst("return 1", mk.ret(mkv(1)));

    tst("nil", {type: "Nil"});
    tst("true", {type: "Boolean", value: true});
    tst("false", {type: "Boolean", value: false});

    tst("1\n2", [mk.stmt(mkv(1)), mk.stmt(mkv(2))]);
    tst("1\n2\n3", [mk.stmt(mkv(1)), mk.stmt(mkv(2)), mk.stmt(mkv(3))]);
    tst("fn():\n    1\n2", [
        mk.stmt(mk.fn([], [mk.stmt(mkv(1))])),
        mk.stmt(mkv(2))
    ]);
    tst("if a:\n    1\n2", [
        {
            type: "If",
            test: mk.id("a"),
            then: mk.block([mk.stmt(mkv(1))]),
            "else": null
        },
        mk.stmt(mkv(2))
    ]);
    tst("case a:\n    1:\n\n        b", {
        type: "Case",
        to_test: mk.id("a"),
        blocks: [
            {type: "CaseBlock", value: mkv(1), block: mk.block([
                mk.stmt(mk.id("b"))
            ])},
        ],
    });

    t.end();
});

test("module", function(t){
    var src = "";
    src += "import:\n";
    src += "    \"./a\":\n";
    src += "        a\n";
    src += "        b as c\n";
    src += "        Foo\n";
    src += "        Bar as Baz\n";
    src += "\n";
    src += "    \"all\":\n";
    src += "        *\n";
    src += "\n";
    src += "    \"wat\":\n";
    src += "        * as da\n";
    var ast = parser(src);
    t.deepEquals(rmLoc(ast)[0], {
        type: "ImportBlock",
        "modules": [
            {
                type: "Import",
                path: mkv("./a"),
                names: [
                    {
                        type: "ImportName",
                        name: mk.id("a"),
                        as: null,
                        is: null,
                    },
                    {
                        type: "ImportName",
                        name: mk.id("b"),
                        as: mk.id("c"),
                        is: null,
                    },
                    {
                        type: "ImportName",
                        name: mk.Type("Foo"),
                        as: null,
                        is: null,
                    },
                    {
                        type: "ImportName",
                        name: mk.Type("Bar"),
                        as: mk.Type("Baz"),
                        is: null,
                    },
                ],
            },
            {
                type: "Import",
                path: mkv("all"),
                names: [
                    {
                        type: "ImportName",
                        name: null,
                        as: null,
                        is: null,
                    },
                ],
            },
            {
                type: "Import",
                path: mkv("wat"),
                names: [
                    {
                        type: "ImportName",
                        name: null,
                        as: mk.id("da"),
                        is: null,
                    },
                ],
            },
        ],
    });


    src = "";
    src += "import:\n";
    src += "    \"./a.js\":\n";
    src += "        a is Fn(String) Number\n";
    src += "        b as c is String\n";
    ast = parser(src);
    t.deepEquals(rmLoc(ast)[0], {
        type: "ImportBlock",
        "modules": [
            {
                type: "Import",
                path: mkv("./a.js"),
                names: [
                    {
                        type: "ImportName",
                        name: mk.id("a"),
                        as: null,
                        is: {
                            type: "FunctionType",
                            params: [mk.Type("String")],
                            "return": mk.Type("Number"),
                        },
                    },
                    {
                        type: "ImportName",
                        name: mk.id("b"),
                        as: mk.id("c"),
                        is: mk.Type("String"),
                    },
                ],
            },
        ],
    });


    src = "";
    src += "export:\n";
    src += "    a\n";
    src += "    Foo\n";
    ast = parser(src);
    t.deepEquals(rmLoc(ast)[0], {
        type: "ExportBlock",
        names: [
            {
                type: "ExportName",
                name: mk.id("a"),
            },
            {
                type: "ExportName",
                name: mk.Type("Foo"),
            },
        ],
    });

    src = "";
    src += "export:\n";
    src += "    *\n";
    ast = parser(src);
    t.deepEquals(rmLoc(ast)[0], {
        type: "ExportBlock",
        names: [
            {
                type: "ExportName",
                name: null,
            },
        ],
    });

    t.end();
});

test("errors", function(t){
    try{
        parser("one two@three", {filepath: "some-file"});
        t.ok(false, "should fail");
    }catch(e){
        t.equals(e + "", "Error: Invalid syntax");
        t.deepEquals(e.ecmaless.loc, {
            source: "some-file",
            start: {line: 1, column: 4},
            end: {line: 1, column: 7},
        });
    }

    try{
        parser("if 1:blah", {filepath: "some-file"});
        t.ok(false, "should fail");
    }catch(e){
        t.equals(e + "", "Error: Invalid syntax");
        t.deepEquals(e.ecmaless.loc, {
            source: "some-file",
            start: {line: 1, column: 5},
            end: {line: 1, column: 9},
        });
    }

    t.end();
});

test("loc", function(t){
    var src = "1";

    var ast = parser(src, {filepath: "/some/file/path-ok?"});
    t.deepEquals(ast[0].loc, {
        source: "/some/file/path-ok?",
        start: {line: 1, column: 0},
        end: {line: 1, column: 1}
    });

    t.end();
});

test("TypeExpression", function(t){
    var tst = function(src, expected){
        src = "ann foo = " + src;
        var ast = parser(src)[0];
        t.deepEquals(rmLoc(ast), {
            type: "Annotation",
            id: mk.id("foo"),
            def: expected,
        });
    };
    var tstFail = function(src){
        try{
            parser("ann foo = " + src);
            t.fail(src + " should not parse");
        }catch(e){
            t.ok(e);
        }
    };

    tst("String", {
        type: "Type",
        value: "String",
        params: [],
    });

    tst("Fn (String, Number) String", {
        type: "FunctionType",
        params: [
            mk.Type("String"),
            mk.Type("Number"),
        ],
        "return": mk.Type("String"),
    });

    tst("{one: String}", {
        type: "StructType",
        pairs: [
            [mk.sym("one"), mk.Type("String")],
        ]
    });

    tst("{one: String, two: Number}", {
        type: "StructType",
        pairs: [
            [mk.sym("one"), mk.Type("String")],
            [mk.sym("two"), mk.Type("Number")],
        ]
    });

    tst("{\n    one: String,\n}", {
        type: "StructType",
        pairs: [
            [mk.sym("one"), mk.Type("String")],
        ]
    });

    tst("{\n    one: String,\n    two: Number,\n}", {
        type: "StructType",
        pairs: [
            [mk.sym("one"), mk.Type("String")],
            [mk.sym("two"), mk.Type("Number")],
        ]
    });

    tst("{def: String, fn: Number}", {
        type: "StructType",
        pairs: [
            [mk.sym("def"), mk.Type("String")],
            [mk.sym("fn"), mk.Type("Number")],
        ]
    });

    tstFail("{}");
    tstFail("{1: String}");
    tstFail("{\"1\": String}");
    tstFail("{\n    one: String,\n    two: Number\n}");
    tstFail("{one: String,}");

    tst("Foo<String>", {
        type: "Type",
        value: "Foo",
        params: [
            mk.Type("String"),
        ],
    });

    tst("Foo<a>", {
        type: "Type",
        value: "Foo",
        params: [
            {
                type: "TypeVariable",
                value: "a",
            },
        ],
    });

    tst("fooBar", {
        type: "TypeVariable",
        value: "fooBar",
    });

    t.end();
});

test("TypeAlias", function(t){
    var tst = function(src, expected){
        var ast = parser(src)[0];
        t.deepEquals(rmLoc(ast), expected);
    };

    tst("alias SomeId = String", {
        type: "TypeAlias",
        id: mk.Type("SomeId"),
        value: mk.Type("String"),
    });

    tst("alias Foo<a, b> = Fn (a) b", {
        type: "TypeAlias",
        id: mk.Type("Foo", ["a", "b"]),
        value: {
            type: "FunctionType",
            params: [{type: "TypeVariable", value: "a"}],
            "return": {type: "TypeVariable", value: "b"},
        },
    });

    t.end();
});

test("Enum", function(t){
    var tst = function(src, expected){
        var ast = parser(src)[0];
        t.deepEquals(rmLoc(ast), expected);
    };

    tst("enum Status:\n    Connected()\n    Disconnected()", {
        type: "Enum",
        id: mk.Type("Status"),
        variants: [
            {
                type: "EnumVariant",
                tag: mk.Type("Connected"),
                params: [],
            },
            {
                type: "EnumVariant",
                tag: mk.Type("Disconnected"),
                params: [],
            },
        ],
    });

    tst("enum AsyncResp<err, data>:\n    Error(err)\n    Data(data)", {
        type: "Enum",
        id: mk.Type("AsyncResp", ["err", "data"]),
        variants: [
            {
                type: "EnumVariant",
                tag: mk.Type("Error"),
                params: [{type: "TypeVariable", value: "err"}],
            },
            {
                type: "EnumVariant",
                tag: mk.Type("Data"),
                params: [{type: "TypeVariable", value: "data"}],
            },
        ],
    });

    tst("HttpResp.Error(\"it failed\")", mk.stmt({
        type: "EnumValue",
        enum: mk.Type("HttpResp"),
        tag: mk.Type("Error"),
        params: [mk.str("it failed")],
    }));

    tst("AsyncResp<String, Number>.Error(\"it failed\")", mk.stmt({
        type: "EnumValue",
        enum: mk.Type("AsyncResp", [mk.Type("String"), mk.Type("Number")]),
        tag: mk.Type("Error"),
        params: [mk.str("it failed")],
    }));

    tst("Error(\"it failed\")", mk.stmt({
        type: "EnumValue",
        enum: null,
        tag: mk.Type("Error"),
        params: [mk.str("it failed")],
    }));

    var src = "";
    src += "case resp:\n";
    src += "    Foo(a, b):\n";
    src += "        one\n";
    src += "    A.Bar():\n";
    src += "        two\n";
    src += "    B<c, String>.Baz(e, f, g):\n";
    src += "        three\n";
    t.deepEquals(JSON.stringify(rmLoc(parser(src)[0].blocks)), JSON.stringify([
        {
            type: "CaseBlock",
            value: {
                type: "EnumValue",
                enum: null,
                tag: mk.Type("Foo"),
                params: [mk.id("a"), mk.id("b")],
            },
            block: mk.block([mk.stmt(mk.id("one"))]),
        },
        {
            type: "CaseBlock",
            value: {
                type: "EnumValue",
                enum: mk.Type("A"),
                tag: mk.Type("Bar"),
                params: [],
            },
            block: mk.block([mk.stmt(mk.id("two"))]),
        },
        {
            type: "CaseBlock",
            value: {
                type: "EnumValue",
                enum: mk.Type("B", ["c", mk.Type("String")]),
                tag: mk.Type("Baz"),
                params: [mk.id("e"), mk.id("f"), mk.id("g")],
            },
            block: mk.block([mk.stmt(mk.id("three"))]),
        },
    ]));

    t.end();
});
