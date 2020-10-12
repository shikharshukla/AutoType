var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser')
var app = express();
var path = require('path');
var fs = require('fs')
var https = require('https')
var upload = require("express-fileupload");
var MongoClient = require('mongodb').MongoClient;
var uri = "mongodb+srv://mongoking:jZubDqN1YAiOVJ3c@solvealledu-dzjnn.mongodb.net/test?retryWrites=true";
var options = { "useNewUrlParser": true };
var sess;
const bcrypt = require('bcryptjs');
const saltRounds = 10;

// Nodejs encryption with Cryptr
const Cryptr = require('cryptr');
const cryptr = new Cryptr('autotype_secret@key');
//const encryptedString = cryptr.encrypt('bacon');
//const decryptedString = cryptr.decrypt(encryptedString);

//added to manage "payload too large" error...
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));


require.extensions['.attype'] = function(module, filename) {
    module.exports = fs.readFileSync(filename, 'utf8');
};




function setsession(s) {
    sess.email = s.email;
    sess.password = s.password;
    sess.fname = s.fname;
}

function checksignupuname(email, callback) {
    MongoClient.connect(uri, options, function(err, client) {
        const collection = client.db("ESolve").collection("EsolveUsers");
        collection.findOne({ 'email': email }, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server");
                throw err;
            } else {
                if (res == null) {
                    callback("n");
                } else {
                    callback("y");
                }
            }
        });
        client.close();
    });
}

function newsignup(data, callback) {
    MongoClient.connect(uri, options, function(err, client) {
        const collection = client.db("ESolve").collection("EsolveUsers");
        collection.insertOne(data, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server!");
                callback("na");
                throw err;
            } else {
                callback("aa");
            }
        });
        client.close();
    });
}


function checksignin(email, callback) {
    MongoClient.connect(uri, options, function(err, client) {
        const collection = client.db("ESolve").collection("EsolveUsers");
        collection.findOne({ 'email': email }, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server");
                throw err;
            } else {
                if (res == null) {
                    callback("n");
                } else {
                    console.log("Sign-in attempt for email: " + email);
                    //console.log(res);
                    callback(JSON.stringify(res));
                }
            }
        });
        client.close();
    });

}


function getquestions(query, callback) {
    MongoClient.connect(uri, options, function(err, client) {
        const collection = client.db("Edu").collection("Qdata");
        collection.aggregate([{ $match: { $and: [query, { qtype: "01" }, { ansindex: { $exists: true } }] } }, { $sample: { size: 20 } }]).toArray(function(err, result) {
            if (err) { throw err };
            var count = {};
            count['qbank'] = result;
            callback(count);
        });
        client.close();
    });

}
app.set('views', path.join(__dirname + '/views'));

app.engine('html', require('ejs').renderFile);
app.use(session({ secret: 'solipsist' }));
//app.use(bodyParser.json());
app.use(upload());

//app.use(bodyParser.urlencoded({ extended: true }));



app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE");
    res.sendFile(path.join, (__dirname, '/public', '/index.html'));
});

app.get('/logout', function(req, res) {
    var email = sess.email;
    req.session.destroy(function(err) {
        if (err) {
            console.log(err);
        } else {
            console.log(email + ' Logged Out!');
            res.send("ok");
        }
    });
});



app.get('/es', function(req, res) {
    res.render("esolvelogin.html");
});

app.get('/eshome', function(req, res) {
    sess = req.session;
    if (sess.password && sess.email)
        res.render("esolvehome.html");
    else
        res.render("error.html");
});



app.get('/athome', function(req, res) {
    sess = req.session;
    var g_res = res;

    console.log(typeof req.session.email);

    MongoClient.connect(uri, options, function(err, client) {
        const collection = client.db("Autotype").collection(req.session.email);

        collection.find({}, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server");
                throw err;
            } else {

                console.log(res);

                if (sess.password && sess.email)
                    g_res.render("autotypehome.html", { req: req });
                else
                    g_res.render("error.html");

            }
        });

        client.close();

    });


});

app.get('/error', function(req, res) {
    res.render("error.html");
});

app.post('/signup', function(req, res) {
    checksignupuname(req.body.email, function(chk) {
        if (chk.localeCompare("y") == 0) {
            console.log("User already exists with email: " + req.body.email);
            res.setHeader("Content-Type", "application/json");
            res.send('{"message":"ae"}');
        } else {
            var data = req.body;
            data['accstatus'] = "inactive";
            //we need to also change this because there's not separate sign-up for tutors
            data['acctype'] = "user";
            bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
                var data1 = data;
                data1.password = hash;
                console.log("New user crated with email: " + data1.email);
                newsignup(data1, function(dbr) {
                    res.setHeader("Content-Type", "application/json");
                    res.send('{"message":"' + dbr + '"}');
                });
            });
        }
    });
});

app.post('/startpractice', function(req, res) {
    sess = req.session;
    if (sess.password && sess.email) {
        var subchapinp = req.body.chapter;
        var subchapq = { "$or": [] };
        var op = [];
        for (n in subchapinp) {
            var ip = { "$and": [] };
            var empa = [];
            var subj = subchapinp[n].substring(0, 1);
            var chapt = subchapinp[n].substring(1, 3);
            var sub = { "subject": subj };
            var chap = { "chapter": chapt };
            empa.push(sub);
            empa.push(chap);
            ip["$and"] = empa;
            op.push(ip);
        }
        subchapq["$or"] = op;
        getquestions(subchapq, function(qbank) {
            res.setHeader("Content-Type", "application/json");
            res.send(qbank);
        });
    } else
        res.render("error.html");

});

app.get('/getud', function(req, res) {
    sess = req.session;
    if (sess.password && sess.email) {
        var resp = { "email": sess.email, "fname": sess.fname };
        res.setHeader("Content-Type", "application/json");
        res.send(resp);
    } else
        res.render("error.html");
});


app.post('/signin', function(req, res) {
    sess = req.session;
    checksignin(req.body.email, function(chk) {
        if (chk.localeCompare("n") == 0) {
            console.log("Login credentials do not match for email: " + req.body.email);
            res.setHeader("Content-Type", "application/json");
            res.send('{"message":"ude"}');
        } else {
            var userchkjson = JSON.parse(chk);
            var hash = userchkjson.password;
            bcrypt.compare(req.body.password, hash, function(err, resp) {
                if (resp == true) {
                    if (userchkjson.accstatus.localeCompare("inactive") == 0) {
                        res.setHeader("Content-Type", "application/json");
                        res.send('{"message":"ui"}');
                    } else {
                        //If 'active' then set the session. 
                        setsession(userchkjson); //this function sets req.session.email = usercheckjson.email and req.session.password = userchkjson.passowrd
                        res.setHeader("Content-Type", "application/json");
                        if (userchkjson['acctype'] == "user") {
                            res.send('{"message":"u_sl"}');
                        } else if (userchkjson['acctype'] == "tutor") {
                            res.send('{"message":"t_sl"}');
                        }
                    }
                } else {
                    res.setHeader("Content-Type", "application/json");
                    res.send('{"message":"ip"}');
                }
            });
        }
    });
});



app.use(function(req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE");
    next();
});


var server = app.listen(8081, function() {
    var host = server.address().address
    var port = server.address().port
    console.log("Server listening at", host, port)
    console.log('Xx________SolveAll_______xX')
});




app.get("/automatalogin", function(req, res) {
    res.render("automatalogin.html");
})

function automata_newsignup(data, callback) {
    MongoClient.connect(uri, options, function(err, client) {
        const all_collection = client.db("Automata").collection("AutomataUsers");

        all_collection.insertOne(data, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server!");
                callback("na");
                throw err;
            } else {
                callback("aa");
            }
        });

        const collection = client.db("Automata").collection(data.email);
        collection.insertOne(data, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server!");
                callback("na");
                throw err;
            } else {
                callback("aa");
            }
        });
        client.close();
    });
}

function automata_checksignupuname(email, callback) {

    MongoClient.connect(uri, options, function(err, client) {
        const collection = client.db("Automata").collection("AutomataUsers");
        collection.findOne({ 'email': email }, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server");
                throw err;
            } else {
                if (res == null) {
                    callback("n");
                } else {
                    callback("y");
                }
            }
        });
        client.close();
    });
}



app.post('/automatasignup', function(req, res) {
    automata_checksignupuname(req.body.email, function(chk) {
        if (chk.localeCompare("y") == 0) {
            console.log("User already exists with email: " + req.body.email);
            res.setHeader("Content-Type", "application/json");
            res.send('{"message":"ae"}');
        } else {
            var data = req.body;

            bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
                var data1 = data;
                data1.password = hash;
                console.log("New user crated with email: " + data1.email);
                automata_newsignup(data1, function(dbr) {
                    res.setHeader("Content-Type", "application/json");
                    res.send('{"message":"' + dbr + '"}');
                });
            });
        }
    });
});

app.post('/automatasignin', function(req, res) {
    sess = req.session;
    automata_checksignin(req.body.email, function(chk) {
        if (chk.localeCompare("n") == 0) {
            console.log("Login credentials do not match for email: " + req.body.email);
            res.setHeader("Content-Type", "application/json");
            res.send('{"message":"ude"}');
        } else {
            var userchkjson = JSON.parse(chk);
            var hash = userchkjson.password;
            bcrypt.compare(req.body.password, hash, function(err, resp) {
                if (resp == true) {
                    setsession(userchkjson); //this function sets req.session.email = usercheckjson.email and req.session.password = userchkjson.passowrd
                    res.setHeader("Content-Type", "application/json");
                    res.send('{"message":"a_sl"}');
                } else {
                    res.setHeader("Content-Type", "application/json");
                    res.send('{"message":"ip"}');
                }
            });
        }
    });
});


function automata_checksignin(email, callback) {
    MongoClient.connect(uri, options, function(err, client) {
        const collection = client.db("Automata").collection("AutomataUsers");
        collection.findOne({ 'email': email }, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server");
                throw err;
            } else {
                if (res == null) {
                    callback("n");
                } else {
                    console.log("Sign-in attempt for email: " + email);
                    //console.log(res);
                    callback(JSON.stringify(res));
                }
            }
        });
        client.close();
    });

}


app.get('/automatahome', function(req, res) {
    sess = req.session;
    if (sess.password && sess.email)
        res.render("automatahome.html", { req: req, upload_done: false });
    else
        res.render("error.html");
});

app.post("/addBatch", function(req, res) {
    var g_res = res;
    MongoClient.connect(uri, options, function(err, client) {
        const collection = client.db("Autotype").collection(req.session.email);

        var batch_json = {
            batchName: req.body.b_name,
            students: []
        };


        collection.findOne({ 'batchName': req.body.b_name }, function(err, res) {
            if (err) {
                console.log("Database throttle.. Investigate Server");
                throw err;
            } else {
                if (res == null) {
                    collection.insertOne(batch_json, function(err, res) {
                        if (err) {
                            console.log("Database throttle.. Investigate Server!");
                            throw err;
                        } else {
                            console.log(res.ops);
                            g_res.redirect("/athome");
                        }
                    });
                } else {
                    console.log("Batch Already Exists!");
                    g_res.redirect("/athome");
                }
            }
        });



        client.close();

    });
});

app.post("/upload_file", function(req, res) {

    if (req.files) {

        var file = req.files.filename;
        var filename = file.name;
        var dir = './Uploads/' + req.session.email;


        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir)
        }

        file.mv(dir + "/" + filename, function(err) {
            if (err) {
                console.log(err);
            } else {

                res.render("automatahome.html", { req: req, upload_done: true });
            }
        })
    }
});

/* AUTOTYPE MADE BY HIMANSH */


var temp_file_name = "";
var coming_from_upload = false;

var renderEmptyFile = false;

app.get("/temp_open_autotype", function(req, res) {
    res.render("autotype_fileUpload.html", { req: req, upload_done: false });
});


app.post("/getEmptyFile", function(req, res) {
    renderEmptyFile = true;
    coming_from_upload = true;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE");
    res.setHeader("Content-Type", "application/json");
    var message = { "data": "emptyFileTriggered" };
    res.send(message);

})

app.post("/upload_file_autotype", function(req, res) {
    if (req.files) {

        var file = req.files.filename;
        var filename = temp_file_name = Math.floor(Math.random() * 100000) + file.name;

        var dir = './Uploads_autotypeFiles';


        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir)
        }

        file.mv(dir + "/" + filename, function(err) {
            if (err) {
                console.log(err);
            } else {
                //file is uploaded.... here add a check that if file isn't a valid json then dont' open our tool...

                coming_from_upload = true;
                res.send("Uploaded");
                //res.render("autotype_fileUpload.html", { req: req, upload_done: true });
            }
        })
    }
});

/* Merging starts here ... */
app.get("/autoType_tool", function(req, res) {
    if (coming_from_upload) {
        res.render("autotype_tool.html");
        coming_from_upload = false;
    } else {
        res.redirect("/temp_open_autotype");
    }
});

app.get("/getJson", function(req, res) {

    if (renderEmptyFile) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.send({ "Page_1": [] });
        renderEmptyFile = false;
    } else {
        var file = "./Uploads_autotypeFiles/" + temp_file_name;
        var data = require(file);

        //this data is encrypted ... we have to decrypt it..
        var decryptedString = cryptr.decrypt(data);

        res.setHeader("Access-Control-Allow-Origin", "*");
        var to_send;
        try {
            to_send = JSON.parse(decryptedString);
            res.send(to_send);
        } catch (err) {
            console.log("Invalid JSON");
            res.send("invalid json");
        }

        temp_file_name = "";
    }

});



app.post("/getEncrypted", function(req, res) {
    //sends encrypted string to attool

    var decryptedString = req.body.data;

    var encryptedString = cryptr.encrypt(decryptedString);


    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE");
    res.setHeader("Content-Type", "application/json");
    var message = { "data": encryptedString };
    res.send(message);

});

app.post("/getDecrypted", function(req, res) {
    //sends encrypted string to attool

    var encryptedString = req.body.data;
    var decryptedString = cryptr.decrypt(encryptedString);


    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE");
    res.setHeader("Content-Type", "application/json");
    var message = { "data": decryptedString };
    res.send(message);

});



app.get("/json_to_attype", function(req, res) {
    res.render("json_to_attype.html");
});

app.get("/upload_file_autotype", function(req, res) {
    res.redirect("/temp_open_autotype");
});