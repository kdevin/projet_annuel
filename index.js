const cheerio = require('cheerio'),
	fs = require('fs'),
	path = require('path'),
	Crawler = require('simplecrawler'),
	Promise = require('bluebird'),
	exec = require('child_process').exec,
	Entities = require('html-entities').AllHtmlEntities;

const entities = new Entities();

var pool = [
	"http://www.skysports.com/football/news/more/1",
	"http://www.skysports.com/football/news/more/2",
	"http://www.skysports.com/football/news/more/3",
	"http://www.skysports.com/football/news/more/4",
	"http://www.skysports.com/football/news/more/5",
	"http://www.skysports.com/football/news/more/6",
	"http://www.skysports.com/football/news/more/7",
	"http://www.skysports.com/football/news/more/8",
	"http://www.skysports.com/football/news/more/9",
	"http://www.skysports.com/football/news/more/10",
	"http://www.skysports.com/football/news/more/11",
	"http://www.skysports.com/football/news/more/12",
	"http://www.skysports.com/football/news/more/13",
	"http://www.skysports.com/football/news/more/14",
	"http://www.skysports.com/football/news/more/15"
];

const poolpath = "/football/news";

const htmlpath = './download/',
	jsonpath = './json/';


var crawlFromUrl = function(initialURL) {
	return new Promise(function (resolve, reject){
		// Crawled URL
		var parsedJson = JSON.parse(fs.readFileSync("crawled_urls.json"));

		var map = new Map();
		parsedJson.urls.forEach(function(element){
			map.set(element, 1);
		});

		// Crawler with configuration
	    var crawler = new Crawler(initialURL);
	    crawler.maxDepth = 3;

	    // Crawler started
	    crawler.on("crawlstart", function() {
		    console.log("Crawl started with "+initialURL+"");
		});

	    // Fetch started
		// crawler.on("fetchstart", function(queueItem) {
		//     console.log("fetchStart : " + queueItem.url + " de profondeur " + queueItem.depth);
		// });

		// URL fetched from the queue
		crawler.on('fetchcomplete', function(queueItem, responseBuffer, response) {
			// We keep the article name in the URL
	        var urlSplitted = queueItem.url.split('/');
	        var urlEndSplitted = urlSplitted[urlSplitted.length - 1].split('-');

	        // We skip all irregular article names
	        if(urlEndSplitted.length > 3){
	            // Path to save file
	            var filepath = htmlpath + queueItem.url.split('/')[queueItem.url.split('/').length - 1] + ".html";

	            // We create the folder if it doesn't already exist
	            if (!fs.existsSync(htmlpath)){
	                fs.mkdirSync(htmlpath);
	            }
	            // We create the HTML file which will contain the buffer
	            fs.writeFile(filepath, responseBuffer, function(err) { 
	                if (err){
	                	console.error("ERROR when writing the file.");
	                	reject(err);
	                }
	            });

	            console.log("I just received %s (%d bytes)", queueItem.url, responseBuffer.length);
	            console.log("It was a resource of type %s", response.headers["content-type"]);

	            // We add the current URL in our pool of crawled URLs
	            parsedJson.urls.push(queueItem.url);
	        }
		});

		// We add a fetch condition : the URL must respect the poolpath, or hasn't been crawled yet
		crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
			callback(null, queueItem.path.startsWith(poolpath) && map.get(queueItem.url) === undefined);
		    //callback(null, queueItem.path.startsWith(poolpath) || (queueItem.path.indexOf("-vs-") > -1 && queueItem.path.indexOf("/report/") > -1));
		});

		// Crawl is completed
		crawler.on("complete", function() {
		    console.log("Crawl for "+initialURL+" finished!");

		    // We add all the crawled URLs to our file
		    fs.writeFileSync("crawled_urls.json",JSON.stringify(parsedJson, null, 2));

		    resolve();
		});

	    // Crawl started
	    crawler.start();
	});
}

var readDownloadedFiles = function(){
	return new Promise(function(resolve, reject){
		console.log("HTML & DBpedia extraction begins.")
		var htmlFiles = [];

		fs.readdir(htmlpath, (err, files) => {
			if(err){
				console.error("ERROR when reading the folder.");
				reject(err);
			}
			files.forEach(file => {
				var jsonFile = jsonpath+path.basename(file, '.html')+".json";
				if(!fs.existsSync(jsonFile)){
					htmlFiles.push(file);
				}
			});

			Promise.reduce(htmlFiles, function(accumulator, file){
				return loadHtmlFile(file).then(function(result){});
	 		},0)
	 		.then(function(){
	 			console.log("HTML & DBpedia extraction finished.")
	 			resolve();
	 		})
		});
	});
}


var loadHtmlFile = function(file){
	return new Promise((resolve, reject) => {
		var htmlFile = htmlpath+file;
		var jsonFile = jsonpath+path.basename(file, '.html')+".json";

		var html = fs.readFileSync(htmlFile);
	    var $ = cheerio.load(html);

		var dateLastUpdate = $('.article__header-date-time').text();
		var date = dateLastUpdate.split(" ")[2];

		var title = $('.article__title span').text();
		var desc = $('p[itemprop=description]').text();

		var content = "";
		$('.article__body > p').not('p[itemprop=description]').each(function(i, element){
			content += $(this).text().trim()+'\n';
		});

		var dbpedia = "";
		var promise = dbpediaSpotlightRequest(content);
		promise.then(function(value){
			dbpedia = value;
			
			var array = {"date" : date, "title" : title, "description" : desc, "content" : content, "dbpedia" : dbpedia};
			var json = JSON.stringify(array, null, 2);

			if (!fs.existsSync(jsonpath)){
		        fs.mkdirSync(jsonpath);
		    }
			fs.writeFileSync(jsonFile, json, function(err) { 
		        if (err){
		        	console.error("ERROR when writing the JSON file.");
		        	reject(err);
		        }
		    });

		    if(fs.existsSync(jsonFile)){
		    	console.log("JSON file for "+file+" created.");
		    	resolve();
		    }
		});
	});
}

// var dbpediaExtraction = function(){
// 	return new Promise((resolve, reject) => {
// 		console.log("DBpedia extraction begins.")

// 		var files = fs.readdirSync(jsonpath, (err, data) => {
// 			if(err) reject();
// 		})

// 		Promise.reduce(files, function(accumulator, file){
// 			return dbpediaSpotlightRequest(file).then(function(result){});
// 		},0)
// 		.then(function(){
// 			console.log("DBpedia extraction finished.")
// 			resolve();
// 		})
// 	});
// }

// var dbpediaSpotlightRequest = function(file){
// 	return new Promise(function (resolve, reject){
// 		var json = JSON.parse(fs.readFileSync(jsonpath+'/'+file));

// 		if(!("dbpedia" in json) || json.dbpedia === null){
// 			var request = 'curl -H "Accept:text/html" http://localhost:2222/rest/annotate --data-urlencode "text='+json.content.replace(/[\\$'"]/g, "\\$&")+'" --data "confidence=0.5"  --data "types=SoccerPlayer,SoccerManager,SoccerClub,SoccerLeague,Stadium,SportsManager"'

// 			exec(request, function(error, stdout, stderr){
// 				var $ = cheerio.load(stdout);
// 				var result = $('div').html();
// 				json.dbpedia = entities.decode(result).replace(/\\'/g, "'").replace(/\n/g, '');

// 				fs.writeFile(jsonpath+'/'+file, JSON.stringify(json, null, 2), function(err){
// 					if(err) reject(err);
// 					console.log('DBpedia extracted for '+file);
// 					resolve();
// 				})
// 			});
// 		}else{
// 			resolve();
// 		}
// 	});
// }

var dbpediaSpotlightRequest = function(content){
	return new Promise(function (resolve, reject){
		var request = 'curl -H "Accept:text/html" http://localhost:2222/rest/annotate --data-urlencode "text='+content.replace(/[\\$'"]/g, "\\$&")+'" --data "confidence=0.5"  --data "types=SoccerPlayer,SoccerManager,SoccerClub,SoccerLeague,Stadium,SportsManager"'

		exec(request, function(error, stdout, stderr){
			var $ = cheerio.load(stdout);
			var result = $('div').html();
			result = entities.decode(result).replace(/\\'/g, "'").replace(/\n/g, '');

			resolve(result);
		});
	});
}

Promise.reduce(pool, function(accumulator, url){
	return crawlFromUrl(url).then(function(result){});
},0)
.then(readDownloadedFiles)
.then(function(){
	var news = []

	fs.readdir(jsonpath, (err, files) => {
		if(err) console.error("ERROR when reading the folder."); 

		files.forEach(file => {
			var json = JSON.parse(fs.readFileSync(jsonpath+'/'+file));
			news.push(json);
		});

		fs.writeFile('../entities_front/src/assets/news.json', JSON.stringify(news, null, 2), function(err){
			if(err) console.log(err);
		})
	});

	console.log("Process finished!");
})

/* To remove duplicates */
// var uniqueArray = function(arrArg) {
//     return arrArg.filter(function(elem, pos, arr) {
//         return arr.indexOf(elem) == pos;
//    	});
// };

/* Deleting duplicates */
// parsedJson.urls = uniqueArray(parsedJson.urls);