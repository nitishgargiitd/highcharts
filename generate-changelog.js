/* eslint-env node, es6 */
/* eslint valid-jsdoc: 0, no-console: 0, require-jsdoc: 0 */

/**
 * This node script copies commit messages since the last release and
 * generates a draft for a changelog.
 *
 * Parameters
 * --after String The start date.
 * --before String Optional. The end date for the changelog, defaults to today.
 */

(function () {
    'use strict';

    var fs = require('fs'),
        cmd = require('child_process');

    var params;

    /**
     * Get parameters listed by -- notation
     */
    function getParams() {
        var p = {};
        process.argv.forEach(function (arg, j) {
            if (arg.substr(0, 2) === '--') {
                p[arg.substr(2)] = process.argv[j + 1];
            }
        });
        return p;
    }

    /**
     * Get the log from Git
     */
    function getLog(callback) {
        var command;

        function puts(err, stdout) {
            if (err) {
                throw err;
            }
            callback(stdout);
        }

        command = 'git log --after={' + params.after + '} --format="%s<br>" ';
        if (params.before) {
            command += '--before={' + params.before + '} ';
        }

        cmd.exec(command, null, puts);
    }

    /**
     * Prepare the log for each product, and sort the result to get all additions, fixes
     * etc. nicely lined up.
     */
    function washLog(name, log) {
        var washed = [],
            proceed = true;

        log.forEach(function (item) {

            // Keep only the commits after the last release
            if (proceed && (new RegExp('official release ---$')).test(item)) {
                proceed = false;
            }

            if (proceed) {

                // Commits tagged with Highstock or Highmaps
                if (name === 'Highstock' && item.indexOf('Highstock:') === 0) {
                    washed.push(item.replace(/Highstock:\s?/, ''));
                } else if (name === 'Highmaps' && item.indexOf('Highmaps:') === 0) {
                    washed.push(item.replace(/Highmaps:\s?/, ''));

                // All others go into the Highcharts changelog for review
                } else if (name === 'Highcharts' && !/^High(stock|maps):/.test(item)) {
                    washed.push(item);
                }
            }
        });

        // Last release not found, abort
        if (proceed === true) {
            throw 'Last release not located, try setting an older start date.';
        }

        // Sort alphabetically
        washed.sort();

        // Pull out Fixes and append at the end
        var fixes = washed.filter(message => {
            return message.indexOf('Fixed') === 0;
        });

        if (fixes.length > 0) {
            washed = washed.filter(message => {
                return message.indexOf('Fixed') !== 0;
            });

            washed = washed.concat(fixes);
            washed.startFixes = washed.length - fixes.length;
        }

        return washed;
    }

    /**
     * Build the output
     */
    function buildHTML(name, version, date, log, products) {
        var s,
            filename = 'changelog-' + name.toLowerCase() + '.htm';

        log = washLog(name, log);

        // Start the string
        s = '<p>' + name + ' ' + version + ' (' + date + ')</p>\n' +
            '<ul>\n';

        if (name === 'Highstock' || name === 'Highmaps') {
            s += '    <li>Most changes listed under Highcharts ' + products.Highcharts.nr +
                ' above also apply to ' + name + ' ' + version + '.</li>\n';
        }

        var productPrefix = '',
            versionDashed = version.replace(/\./g, '-');

        if (name === 'Highstock') {
            productPrefix = 'hs-';
        } else if (name === 'Highmaps') {
            productPrefix = 'hm-';
        }

        log.forEach((li, i) => {

            // Hyperlinked issue numbers
            li = li.replace(
                /#([0-9]+)/g,
                '<a href="https://github.com/highslide-software/highcharts.com/issues/$1">#$1</a>'
            );

            // Start fixes
            if (i === log.startFixes) {
                s += '\n';
                s += `
</ul>
<div id="accordion" class="panel-group">
    <div class="panel panel-default">
        <div id="${productPrefix}heading-${versionDashed}-bug-fixes" class="panel-heading">
            <h4 class="panel-title">
                <a href="#${productPrefix}${versionDashed}-bug-fixes" data-toggle="collapse" data-parent="#accordion">
                    Bug fixes
                </a>
            </h4>
        </div>
        <div id="${productPrefix}${versionDashed}-bug-fixes" class="panel-collapse collapse">
            <div class="panel-body">
                <ul>`;
            }


            s += `
                    <li>${li}</li>`;

            // Last item
            if (i === log.length - 1) {
                s += `
                </ul>`;

                if (typeof log.startFixes === 'number') {
                    s += `
            </div>
        </div>
    </div>
</div>`;
                }
            }
        });

        fs.writeFile(filename, s, function () {
            console.log('Wrote draft to ' + filename);
        });
    }

    params = getParams();


    // Get the Git log
    getLog(function (log) {

        // Split the log into an array
        log = log.split('<br>\n');
        log.pop();

        // Load the current products and versions, and create one log each
        fs.readFile('build/dist/products.js', 'utf8', function (err, products) {
            var name;

            if (err) {
                throw err;
            }

            if (products) {
                products = products.replace('var products = ', '');
                products = JSON.parse(products);
            }

            for (name in products) {
                if (products.hasOwnProperty(name)) {
                    buildHTML(name, products[name].nr, products[name].date, log, products);
                }
            }
        });
    });
}());
