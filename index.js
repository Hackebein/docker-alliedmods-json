const Crawler = require('crawler');
const esr = require('escape-string-regexp');
const fs = require('fs');
const Logger = require('logger').Logger;
const url = require('url');
const _ = require('underscore');

const log = new Logger();
//log.setLevel('fatal');

const binary = process.argv.shift();
const file = process.argv.shift();
const projects = process.argv.shift();
const platforms = process.argv.shift();

const RegExVersion = new RegExp(`((?:[0-9])\\.(?:[0-9]+))`);
const RegExServerFilename = new RegExp(`(${projects})(?:-([0-9])\\.([0-9]+)\\.([0-9]+))?(?:-([a-z]+))?-([a-z]+)([0-9]+)(?:-([a-z]+))?-(${platforms})(?:-([0-9a-z]+))?\\.([0-9a-z.]+)`);

function versionFormat(version) {
    let output = _.filter([version.major, version.minor, version.maintenance, version.build], (num) => !_.isUndefined(num)).join('.');
    if(!output.includes('.')) {
        output = 'latest';
    }
    return _.filter([output, version.tag], (num) => !_.isUndefined(num)).join('-');
}
function projectFormat(project) {
    return _.filter([project.name, project.extra], (num) => !_.isUndefined(num)).join('-');
}
function platformFormat(platform) {
    return _.filter([platform.name, platform.extra], (num) => !_.isUndefined(num)).join('-');
}

let releases = [];
let output = {};
let crawler = new Crawler({
    logger: log,
    maxConnections: 1,
    skipDuplicates: true,
    timeout: 1000,
    retryTimeout: 1500,
    preRequest: (options, done) => {
        let error = new Error();
        if(!_.isRegExp(options.jail)) {
            log.error('Jail is missing or not a RegExp');
            error.op = 'abort';
            url.resolve(res.request.uri.href, $(e).attr("href"));
        } else if(!options.jail.test(options.uri)) {
            log.info('Out of Jail: '  + options.uri);
            error.op = 'abort';
        }
        if(_.isUndefined(error.op)) {
            setTimeout(done, 10);
        } else {
            done(error);
        }
    },
    callback: (error, res, done) => {
        if(error) {
            log.error(error);
        } else {
            log.info(res.options.method + " " + res.request.uri.href + " (" + res.headers['content-type'] + ")");
            switch (res.headers['content-type']) {
                case 'text/html;charset=ISO-8859-1':
                    switch (res.options.method) {
                        case 'GET':
                            if(res.$) {
                                var $ = res.$;
                                $("a[href!='']").each((i, e) => {
                                    requestUrl = url.format(url.resolve(res.request.uri.href, $(e).attr("href")), {
                                        auth: false,
                                        fragment: false,
                                        search: false,
                                    });
                                    crawler.queue({
                                        uri: requestUrl,
                                        jail: res.options.jail,
                                        method: 'HEAD',
                                    });
                                });
                            } else {
                                log.error('Can\'t inject jQuery');
                            }
                            break;
                        case 'HEAD':
                            crawler.queue({
                                uri: res.request.uri.href,
                                jail: res.options.jail,
                                method: 'GET',
                            });
                            break;
                        default:
                            log.error('Unexpected request method ' + res.options.method);
                    }
                    break;
                case 'application/zip':
                case 'application/x-gzip':
                    switch (res.options.method) {
                        case 'HEAD':
                            let pathSegments = res.request.uri.pathname.split('/');
                            let filename = pathSegments.pop();
                            if(RegExServerFilename.test(filename)) {
                                let release = _.chain([
                                        'filename',
                                        'project.name',
                                        'version.major',
                                        'version.minor',
                                        'version.maintenance',
                                        'version.tag',
                                        'scm',
                                        'version.build',
                                        'project.extra',
                                        'platform.name',
                                        'platform.extra',
                                        'extension'
                                    ]).object(RegExServerFilename.exec(filename)).each((val, key, context) => {
                                        let keys = key.split('.');
                                        if(keys.length == 2) {
                                            context[keys[0]] = _.extend(context[keys[0]] || {}, _.object([[keys[1], val]]));
                                        }
                                    }).omit((value, key) => key.includes('.')).value();
                                release.url = res.request.uri;
                                release.tags = [];
                                releases.push(release);
                            } else {
                                log.error('Unexpected filename ' + filename);
                            }
                            break;
                        default:
                            log.error('Unexpected request method ' + res.options.method);
                    }
                    break;
                default:
                    log.warn('Unhandled content-type ' + res.headers['content-type'] + ' (' + res.request.uri.href + ')');
            }
        }
        done();
    },
});

crawler.queue({
    uri: 'https://mms.alliedmods.net/mmsdrop/',
    jail: new RegExp('^' + esr('https://mms.alliedmods.net/mmsdrop/') + '(?:' + RegExVersion.source + '(?:' + esr('/') + '(?:' + RegExServerFilename.source + ')?' + ')?' + ')?' + '$'),
});

crawler.queue({
    uri: 'https://sm.alliedmods.net/smdrop/',
    jail: new RegExp('^' + esr('https://sm.alliedmods.net/smdrop/') + '(?:' + RegExVersion.source + '(?:' + esr('/') + '(?:' + RegExServerFilename.source + ')?' + ')?' + ')?' + '$'),
});

crawler.queue({
    uri: 'https://www.amxmodx.org/amxxdrop/',
    jail: new RegExp('^' + esr('https://www.amxmodx.org/amxxdrop/') + '(?:' + RegExVersion.source + '(?:' + esr('/') + '(?:' + RegExServerFilename.source + ')?' + ')?' + ')?' + '$'),
});

crawler.queue({
    uri: 'https://users.alliedmods.net/~kyles/builds/SteamWorks/',
    jail: new RegExp('^' + esr('https://users.alliedmods.net/~kyles/builds/SteamWorks/') + '(?:' + RegExServerFilename.source + ')?' + '$'),
});

crawler.queue({
    uri: 'https://users.alliedmods.net/~drifter/builds/dhooks/',
    jail: new RegExp('^' + esr('https://users.alliedmods.net/~drifter/builds/dhooks/') + '(?:' + RegExVersion.source + '(?:' + esr('/') + '(?:' + RegExServerFilename.source + ')?' + ')?' + ')?' + '$'),
});

crawler.on('drain', () => {
    if(!releases.length) {
        return;
    }
    releases = _.chain(releases)
        .sortBy((release) => [
                projectFormat(release.project),
                versionFormat(release.version),
                platformFormat(release.platform)
            ].join('-').replace(/\d+/g, (n) => +n+10000))
        .value();
    _.each([
            [],
            ['build'],
            ['maintenance', 'build'],
            ['minor', 'maintenance', 'build']
        ], (reduceVersion) => {
            _.chain(releases)
                .map('platform')
                .uniq(platformFormat)
                .each((platform) => {
                    _.chain(releases)
                        .map('project')
                        .uniq(projectFormat)
                        .each((project) => {
                            _.chain(releases)
                                .omit((release) => !_.isEqual(release.project, project))
                                .map('version')
                                .map((version) => _.omit(version, reduceVersion))
                                .uniq(versionFormat)
                                .each((version) => {
                                    let lastRelease = releases[_.findLastIndex(releases, (release) => _.isEqual(platform, release.platform) && _.isEqual(project, release.project) && _.chain(release.version).omit(reduceVersion).isEqual(version).value())];
                                    if(!_.isUndefined(lastRelease)) {
                                        lastRelease.tags.push([
                                                projectFormat(lastRelease.project),
                                                versionFormat(version),
                                                platformFormat(lastRelease.platform)
                                            ].join('-')
                                        );
                                    }
                                });
                        });
                });
        }
    );
    _.chain(releases).each((release) => {
        _.chain(release.tags).uniq().each((tag) => {
            output[tag] = release.url.href;
        });
    });
    fs.writeFile("./releases.json", JSON.stringify(output), (err) => {
        if(err) {
            log.error(err);
        }
        log.info('job done');
    });
});
