/**
 * Automatic Image resize, reduce with AWS Lambda
 * Lambda main handler
 *
 * @author Yoshiaki Sugimoto
 * @created 2015/10/29
 */
"use strict";

const ImageProcessor = require("./libs/ImageProcessor");
const Config         = require("./libs/Config");
const fs             = require("fs");
const path           = require("path");
const Request        = require("request");

// Lambda Handler
exports.handler = (event, context) => {
    const s3Object   = event.Records[0].s3;
    const configPath = path.resolve(__dirname, "config.json");
    const processor  = new ImageProcessor(s3Object);
    const config     = new Config(
        JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }))
    );

    // populate options
    // add ID to endpoint, ID is name of image after you remove the raw/ directory and file extension
    //console.log("s3object: " + JSON.stringify(s3Object));
    var id = s3Object.object.key;
    id = id.replace(/^raw\//, "");
    id = id.replace(/\.\w{1,4}$/, "");
    var options = {
        uri : config.get("userEndpoint") + id,
        method : "PUT",
        headers: { 
            'Content-Type': 'application/json'
        }
    };

    processor.run(config)
    .then((proceedImages) => {
        //send list of resizes to User service
//      console.log("OK, numbers of " + proceedImages.length + " images has proceeded.");
        var imageList = {}
        // populate list of images by iterating over the processed images array
        // each file will have a output fileName
        // get the type of resize from the first part of the fileName
        for (var i = 0; i < proceedImages.length; i++) {
            var img = proceedImages[i];
            if ('_fileName' in img) {
                var f = img['_fileName'];
                //file will either be reduced or resized and placed in reduced/<file> or resized/size/<file>
                //so there should be at least 2 elements when split by /
                var bits = f.split("/");
                //type will either be reduced or size, add type to imageList
                var type = bits[bits.length-2];
                imageList[type] = f;
            }
        }
        // set the avatar property using the imageList and add to request body
        var avatar = {"avatar": imageList};
        options.body = JSON.stringify(avatar);
        console.log("call to user with: " + JSON.stringify(options));
        // put to User service and tell lambda OK
        Request(options, function(err, resp, body) {
            context.succeed("OK");
        });
    })
    .catch((messages) => {
        if ( messages === "Object was already processed." ) {
            //nothing to do here
            console.log("Image already processed");
            context.succeed("DUPLICATE");
        } else {
            console.log("ERROR: " + messages);
            var avatar = {"avatar": {"ERROR":messages} };
            options.body = JSON.stringify(avatar);
            console.log("call to user with: " + JSON.stringify(options));
            //send error message to User service and tell lambda FAIL
            Request(options, function(err, resp, body) {
                context.fail("FAIL");
            });
        }
    });
};
