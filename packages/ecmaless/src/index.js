var _ = require("lodash");
var λ = require("contra");
var e = require("estree-builder");
var parser = require("ecmaless-parser");
var compiler = require("ecmaless-compiler");
var path_fns = require("path");
var DependencyResolver = require("dependency-resolver");

var normalizePath = function(base, path){
    if(path[0] === "."){
        return path_fns.resolve(base, path);
    }
    return path;
};

module.exports = function(conf, callback){
    var base = conf.base || process.cwd();
    var loadPath = conf.loadPath;
    var start_path = normalizePath(base, conf.start_path);

    var module_src = {};
    var module_ast = {};
    var resolver = new DependencyResolver();

    var parseModules = function parseModules(path, callback){
        if(_.has(module_ast, path)){
            callback();
            return;
        }
        if(/\.js$/i.test(path)){
            resolver.add(path);
            callback();
            return;
        }

        loadPath(path, function(err, src){
            if(err) return callback(err);

            var ast;
            try{
                ast = parser(src, {filepath: path});
            }catch(e){
                callback(e);
                return;
            }

            module_src[path] = src;
            module_ast[path] = ast;
            resolver.add(path);

            var ast0 = _.head(ast);
            if(ast0 && ast0.type === "ImportBlock"){
                λ.each(ast0.modules, function(m, next){
                    //TODO resolve relative to curr path
                    var dep_path = normalizePath(base, m.path.value);

                    resolver.setDependency(path, dep_path);

                    parseModules(dep_path, next);

                }, callback);
            }else{
                callback();
            }
        });
    };


    parseModules(start_path, function(err){
        if(err) return callback(err);

        var paths_to_comp = resolver.sort();

        var body = [];
        var modules = {};

        try{
            _.each(paths_to_comp, function(path, mod_index){
                if(/\.js$/i.test(path)){

                    modules[path] = {
                        commonjs: {
                            path: path,
                            value: require(path),
                        },
                    };

                    body.push(e("var",
                        "$mod$" + mod_index,
                        e("call",
                            e("id", "require"),
                            [e("str", path)]
                        )
                    ));
                    return;
                }
                var src = module_src[path];
                var ast = module_ast[path];

                var c = compiler(ast, {
                    src: src,
                    filepath: path,
                    requireModule: function(path){
                        //TODO resolve relative to curr path
                        path = normalizePath(base, path);

                        return modules[path];
                    },
                });

                c.mod_index = mod_index;
                modules[path] = c;

                var args = [];
                _.each(c.modules, function(path){
                    //TODO resolve relative to curr path
                    path = normalizePath(base, path);
                    var i = _.indexOf(paths_to_comp, path);
                    args.push(e("id", "$mod$" + i));
                });
                body.push(e("var", "$mod$" + mod_index, e("call", c.estree, args)));
            });
        }catch(e){
            callback(e);
            return;
        }

        var main_mod = "$mod$" + _.indexOf(paths_to_comp, start_path);

        body.push(e(";", e("=", e("id", "module.exports"), e("id", main_mod))));

        callback(null, {
            "type": "Program",
            "body": body,
        });
    });
};
