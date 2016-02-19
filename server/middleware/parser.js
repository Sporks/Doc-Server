var fs = require('fs');
var sql = require('sql.js')
var cheerio = require('cheerio');

var parser = {
    node: function(file, db, i){
        sqlstr = "";
        var filename = file.slice(file.lastIndexOf('/')+1)
        var data = fs.readFileSync(file, 'utf-8');
        var $ = cheerio.load(data);
        var methods = [];
        //Keep track of index independently for sake of sql database
        //Go thru all h3 and h2 to get methods  props and events
        //Pass in a size so you dont check previous h2 for class and instead insert the module
        function firstPass(ind, el, size){
            var name = $(el).parent().parent().text();
            //Add href of link to filename
            var link = $(el).attr('href');
            //Match Methods (they have X.string(blah) )
            if(name.match(/\w+\(\w*\)\#$/g)){
                name = name.replace(/\(.*\)\#/g, "");
                //Handle Class Methods
                if(name.match(/^Class\sMethod:\s/)){
                    name = name.replace(/^Class\sMethod:\s/, "")
                }
                sqlstr += `INSERT INTO docsearch VALUES (${i}, '${name}', 'method', '${filename.concat(link)}');`;
                //Push into methods for determining if its an addon page or not
                i++;
                methods.push($(el).attr('href'));
            }
            //Properties are similar to method notation but lack the ()
            else if(name.match(/\.\w+(?!\()#/g) || name.match(/.+\[.*\]#/g)){
                //sometimes classes have a . in them too we will grab classes later
                if(!name.match(/Class/)){
                    name = name.slice(0,-1);
                    sqlstr += `INSERT INTO docsearch VALUES (${i}, '${name}', 'property', '${filename.concat(link)}');`;
                    i++;
                }
            }
            //Find events  they start with Event:
            else if(name.match(/^Event:/g)){
                //get rid of Event: and # and ''s
                name = name.replace(/^Event:\s/g, "").replace(/\'|#/g, "");
                if(size === 'h3'){
                //Find previous h2, prevuntil goes up to but not including, then do one more prev, but filter to just
                    var classname = $(el).parent().parent().prevUntil('h2').prev('h2').text();
                    classname = classname.replace(/Class:\s/g, "").slice(0,-1);
                }
                else if(size === 'h2'){
                    var classname = filename.slice(0,filename.indexOf('.'));
                }
                name = classname.concat("."+name);
                //Concatenate the classname and event name and
                //get rid of # in h2 className
                sqlstr += `INSERT INTO docsearch VALUES(${i}, '${name}', 'event', '${filename.concat(link)}');`;
                i++;

            }
            //Keep track of that Index
        }
        $('h3 a').each((ind,el)=>{
            firstPass(ind,el, 'h3')
        });
        $('h2 a').each((ind, el) =>{
            firstPass(ind, el, 'h2')
        })
        //Check if anything has been put into the sql string, if not, it's not a module.
        if(sqlstr.length >= 65){
            //Get Module name and put in database
            var name = $('#apicontent > h1').text().replace(/#/g, "");
            var link = $('#apicontent > h1 a').attr('href');
            sqlstr += `INSERT INTO docsearch VALUES(${i}, '${name}', 'module', '${filename.concat(link)}');`;
            i++;

            //Time to grab classes and other stragglers
            $('h2 a').each((ind, el) => {
                var name = $(el).parent().parent().text();
                //Add href of link to filename
                var link = $(el).attr('href');
                if(name.match(/^Class\:\s/g)){
                    //replace the class and get rid of the #
                    name = name.replace(/^Class\:\s/g, "").replace(/\'/g,"").slice(0, -1);
                    sqlstr += `INSERT INTO docsearch VALUES(${i}, '${name}', 'class', '${filename.concat(link)}');`;
                    i++;

                }
                //Bad semantic html, check for properties that are in h2
                // Otherwise they are probably sections / chapters.  to be safe, check against matches for
                // events props classes and methods
                else if(!name.match(/Class|Event|\(.*\)|\.\w+(?!\()/)){
                    name = name.replace(/\'/g, "").slice(0,-1);
                    sqlstr += `INSERT INTO docsearch VALUES (${i}, '${name}', 'chapter', '${filename.concat(link)}');`;
                    i++;

                }
            })
        }

        //Insert into sql database
        db.run(sqlstr);
        return ({"DB": db, "index": i})
    },
    express: function(file, db, i){
        var filename = file.slice(file.lastIndexOf('/')+1)
        var data = fs.readFileSync(file, 'utf-8');
        var sqlstr = "";
        var $ = cheerio.load(data);

        var type = '';

        if(filename === "api.html"){
            $('h3').each((ind, ele) => {
                var truthy = ($(ele).text() === "Methods" || $(ele).text() === "Properties" || $(ele).text() === "Events")
                var name = $(ele).attr('id');
                var link = ("#").concat(name)
                if(truthy){
                    type = $(ele).text().toLowerCase();
                }
                else{
                    sqlstr += `INSERT INTO docsearch VALUES (${i}, '${name}', '${type}', '${filename.concat(link)}');`;
                }
                i++;
            })
            $('h2').each((ind, ele) => {
                var name = $(ele).text();
                var link = $(ele).attr('id');
                sqlstr += `INSERT INTO docsearch VALUES (${i}, '${name}', 'class', '${filename.concat(link)}');`;
                i++
            })
        }
        else{
            var name = $('h1').first().text()
            var type = 'chapter';
            sqlstr += `INSERT INTO docsearch VALUES (${i}, '${name}', '${type}', '${filename}');`
            i++;
        }
        db.run(sqlstr)
        return ({"DB": db, "index": i})
    }
};

module.exports = parser;
