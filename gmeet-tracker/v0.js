function register(map, key, value) {
    let arr = map.get(key);
    if (!Array.isArray(arr)) {
        arr = [];
        map.set(key, arr);
    }
    arr.push(value);
}

function fillSpaces(spaces) {
    for (const [space, elementIds] of spaces) {
        $.ajax({
            url: `https://meet.googleapis.com/v2/spaces/${space}`,
            data: {
                key: API_KEY,
                access_token: access_token,
            },
            type: 'GET',
            dataType: 'json',
        }).done(
            (json) => {
                console.log(json);
                for (const elementId of elementIds) {
                    $(`#${elementId}`).html(`<a href='${json.meetingUri}' target='_new''>${json.meetingCode}</a>`);
                }
            }
        ).fail(
            (xhr, status, errorThrown) => {
                console.log("Error: " + errorThrown);
                console.log("Status: " + status);
                console.dir(xhr);
            }
        )
    }
}

function onListConferences() {
    $("#tblConferences").hide();
    $("#tblParticipants").hide();
    $.ajax({
        url: 'https://meet.googleapis.com/v2/conferenceRecords',
        data: {
            key: API_KEY,
            access_token: access_token,
            pageSize: 100,
        },
        type: 'GET',
        dataType: 'json',
    }).done(
        (json) => {
            console.log(json);
            let body = $('#bodyConferences');
            body.text('');
            const spaces = new Map();
            if (json.conferenceRecords) {
                for (const conferenceRecord of json.conferenceRecords) {
                    let conferenceId = trimPrefix(conferenceRecord.name, PREFIX_CONFERENCE_RECORDS);
                    let spaceId = trimPrefix(conferenceRecord.space, PREFIX_SPACES);
                    let elementId = `space_${conferenceId}`;
                    let startTimeMs = Date.parse(conferenceRecord.startTime);
                    let endTimeMs = conferenceRecord.endTime ? Date.parse(conferenceRecord.endTime) : Date.now();
                    let durationMs = Math.max(0, endTimeMs - startTimeMs);
                    if (durationMs > 100_000) { // at least 100 sec
                        let durationStr = formatDuration(durationMs);
                        let startTimeStr = formatDateTime(startTimeMs);
                        let endTimeStr = conferenceRecord.endTime ? formatDateTime(endTimeMs) : '';
                        body.append(`<tr>` +
                            `<td><a href='#conf=${conferenceId}' id='conf_${conferenceId}'>${conferenceId}</a></td>` +
                            `<td class='center'>${durationStr}</td>` +
                            `<td class='center'>${startTimeStr}</td>` +
                            `<td class='center'>${endTimeStr}</td>` +
                            `<td  class='center' id="${elementId}">${spaceId}</td>` +
                            `</tr>`);
                        register(spaces, spaceId, elementId);
                    }
                }
            }
            $("#tblConferences").show();
            fillSpaces(spaces);

            let hash = location.hash;
            if (hash.startsWith('#')) hash = hash.substring(1);
            let params = new URLSearchParams(hash);
            let highlight = params.get('last');
            $(`#conf_${highlight}`).addClass('last-visited-conference');
        }
    ).fail(
        (xhr, status, errorThrown) => {
            console.log("Error: " + errorThrown);
            console.log("Status: " + status);
            console.dir(xhr);
        }
    )
}

function fillUserId(userId)
{
    $.ajax({
        url: `https://people.googleapis.com/v1/people/${userId}?sources=READ_SOURCE_TYPE_PROFILE&sources=READ_SOURCE_TYPE_CONTACT&sources=READ_SOURCE_TYPE_DOMAIN_CONTACT&sources=READ_SOURCE_TYPE_OTHER_CONTACT`,
        data: {
            key: API_KEY,
            access_token: access_token,
            personFields: 'names,emailAddresses,occupations,organizations,phoneNumbers,userDefined,externalIds,imClients,clientData,coverPhotos,photos,miscKeywords',
        },
        type: 'GET',
        dataType: 'json',
    }).done(
        (json) => {
            console.log(json);
            let buffer = '';
            if (Array.isArray(json.names) && json.names.length > 0) {
                $('#name_'+userId).text(json.names[0].displayName);
            }
            if (Array.isArray(json.emailAddresses) && json.emailAddresses.length > 0) {
                $('#email_'+userId).text(json.emailAddresses[0].value);
            }
            if (Array.isArray(json.organizations) && json.organizations.length > 0) {
                let org = json.organizations[0];
                $('#job_'+userId).text(org.title + ' ' + org.department);
            }
            if (Array.isArray(json.userDefined)) {
                let rank = '';
                for (const entry of json.userDefined) {
                    if (entry.key === 'звання') {
                        rank = entry.value;
                    }
                }
                $('#rank_'+userId).text(rank);
            }
            $('#row_'+userId).removeClass('unknown');
        }
    ).fail(
        (xhr, status, errorThrown) => {
            console.log("Error: " + errorThrown);
            console.log("Status: " + status);
            console.dir(xhr);
        }
    )
}

function onListParticipants(conf) {
    $("#tblConferences").hide();
    $("#tblParticipants").hide();
    $.ajax({
        url: `https://meet.googleapis.com/v2/conferenceRecords/${conf}/participants`,
        data: {
            key: API_KEY,
            access_token: access_token,
            pageSize: 100,
        },
        type: 'GET',
        dataType: 'json',
    }).done(
        (json) => {
            console.log(json);
            let body = $("#bodyParticipants");
            body.text('');
            if (json.participants) {
                json.participants.sort((a, b) => {
                    let dna = a.signedinUser?.displayName || a.anonymousUser?.displayName || '';
                    let dnb = b.signedinUser?.displayName || b.anonymousUser?.displayName || '';
                    return dna.localeCompare(dnb);
                });
                let num = 1;
                for (const participant of json.participants) {
                    if (participant.signedinUser) {
                        let displayName = participant.signedinUser.displayName;
                        let userId = trimPrefix(participant.signedinUser.user, PREFIX_USERS);
                        body.append(`<tr class='unknown' id='row_${userId}'>` +
                            `<td class='number'>${num}</td>` +
                            `<td>${displayName}</td>` +
                            `<td id='name_${userId}'></td>` +
                            `<td id='job_${userId}'></td>` +
                            `<td id='rank_${userId}'></td>` +
                            `<td id='email_${userId}'></td>` +
                            `</tr>`);
                        fillUserId(userId);
                        num += 1;
                    }
                    if (participant.anonymousUser) {
                        let displayName = participant.anonymousUser.displayName;
                        body.append(`<tr class='anonymous'>` +
                            `<td class='number'>${num}</td>` +
                            `<td>${displayName}</td>` +
                            `<td colspan='4' class='anonymous-title'>Анонім</td>` +
                            `</tr>`);
                        num += 1;
                    }
                }
            }
            $("#tblParticipants").show();
            $('#backHref').attr('href', `#last=${conf}`);
        }
    ).fail(
        (xhr, status, errorThrown) => {
            console.log("Error: " + errorThrown);
            console.log("Status: " + status);
            console.dir(xhr);
        }
    )
}

function refreshImpl(force) {
    let hash = location.hash;
    if (hash.startsWith('#')) hash = hash.substring(1);
    let params = new URLSearchParams(hash);
    let conf = params.get('conf');
    if (conf) {
        onListParticipants(conf);
    } else {
        let highlight = params.get('last');
        if (highlight && !force) {
            $("#tblParticipants").hide();
            $("#tblConferences").show();
            $(".last-visited-conference").removeClass("last-visited-conference");
            $(`#conf_${highlight}`).addClass("last-visited-conference");
        } else {
            onListConferences();
        }
    }
}

function onRefresh() {
    refreshImpl(true);
}

function onHashChange() {
    refreshImpl(false);
}

$(window).on('hashchange', () => {
    console.log(`hashchange ${location.hash}`);
    onHashChange();
});

$(document).ready(() => {
    $('#btnSignIn').click(onSignIn);
    $('#btnRefresh').click(onRefresh);
    if (access_token) {
        console.log(`already: ${access_token}`);
    } else {
        if (location.hash) {
            let hash = location.hash;
            if (hash.startsWith('#')) hash = hash.substring(1);
            let params = new URLSearchParams(hash);
            access_token = params.get('access_token');
            if (access_token) {
                console.log(`ok: ${access_token}`);
                location.hash = params.get('state') ?? '';
            } else {
                let error_msg = params.get('error');
                console.log(`error: ${error_msg}`);
            }
        } else {
        }
    }
});
