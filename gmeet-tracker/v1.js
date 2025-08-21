const TOOSHORT_CONFERENCE_DURATION_LIMIT_MS = 5*60*1000; // 5min
let contactUniverse = null;
let recentConferences = null;
let selectedParticipants = { conferenceId: '', participants: new Map(), };

function statusInfo(msg) {
    $("#statusline").removeClass('error');
    $("#statusline").addClass('info');
    $("#statusline").text(msg);
}

function statusError(err) {
        $("#statusline").removeClass('info');
        $("#statusline").addClass('error');
        $("#statusline").text(err);    
}

function registerPerson(map, person, data) {
    if (Array.isArray(person.metadata?.sources)) {
        for (const source of person.metadata.sources) {
            const key = `${source.type}:${source.id}`;
            map.set(key, data);
        }
    }
}

function getRegisteredPerson(map, person) {
    if (Array.isArray(person.metadata?.sources)) {
        for (const source of person.metadata.sources) {
            const key = `${source.type}:${source.id}`;
            const data = map.get(key);
            if (data) {
                return data;
            }
        }
    }
    return null;
}

function getAllContactsCb(callback, progress = (msg) => {}) {
    try {
        const universe = {
            groups: new Map(),
            contacts: new Map(),
            registeredPeople: new Map(),
        }
        console.log('Getting contactGroups');
        progress('Отримуємо список груп контактів');
        $.ajax({
            url: `https://people.googleapis.com/v1/contactGroups`,
            data: {
                key: API_KEY,
                access_token,
                pageSize: 100,
            },
            type: 'GET',
            dataType: 'json',
        }).done(
            (json) => {
                try {
                    const resourceNames = [];
                    let maxMembers = 0;
                    if (Array.isArray(json.contactGroups)) {
                        for (const contactGroup of json.contactGroups) {
                            const memberCount = contactGroup.memberCount ?? 0;
                            if (memberCount > 0) {
                                resourceNames.push(contactGroup.resourceName);
                                maxMembers = Math.max(maxMembers, memberCount);
                            }
                        }
                    }
                    maxMembers += 1;
                    if (resourceNames.length == 0) {
                        callback(universe);
                    } else {
                        progress('Отримуємо список контактів в групах');
                        $.ajax({
                            url: `https://people.googleapis.com/v1/contactGroups:batchGet`,
                            data: {
                                key: API_KEY,
                                access_token,
                                resourceNames,
                                maxMembers,
                            },
                            traditional: true,
                            type: 'GET',
                            dataType: 'json',
                        }).done(
                            (json) => {
                                try {
                                    console.log(json);
                                    if (Array.isArray(json.responses)) {
                                        for (const response of json.responses) {
                                            if (response.contactGroup) {
                                                const groupName = response.contactGroup.formattedName ?? response.contactGroup.name;
                                                const groupId = trimPrefix(response.contactGroup.resourceName, PREFIX_CONTACT_GROUPS);
                                                const groupInfo = { groupId, groupName, users: new Map(), };
                                                universe.groups.set(groupId, groupInfo);
                                                if (Array.isArray(response.contactGroup.memberResourceNames)) {
                                                    for (const memberResourceName of response.contactGroup.memberResourceNames) {
                                                        const userId = trimPrefix(memberResourceName, PREFIX_PEOPLE);
                                                        let userInfo = universe.contacts.get(userId);
                                                        if (!userInfo) {
                                                            userInfo = { userId, groups: new Map(), };
                                                            universe.contacts.set(userId, userInfo);
                                                        }
                                                        groupInfo.users.set(userId, userInfo);
                                                        userInfo.groups.set(groupId, groupInfo);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    const resourceNames = [];
                                    for (const [ userId, userInfo, ] of universe.contacts) {
                                        resourceNames.push(PREFIX_PEOPLE + userId);
                                    }
                                    if (resourceNames.length == 0) {
                                        callback(universe);
                                    } else {
                                        progress('Отримуємо детальну інформацію про контакти');
                                        $.ajax({
                                            url: `https://people.googleapis.com/v1/people:batchGet`,
                                            data: {
                                                key: API_KEY,
                                                access_token,
                                                resourceNames,
                                                personFields: 'metadata,names,emailAddresses,occupations,organizations,phoneNumbers,userDefined,externalIds,imClients,clientData,coverPhotos,photos,miscKeywords',
                                                sources: [ 'READ_SOURCE_TYPE_PROFILE', 'READ_SOURCE_TYPE_CONTACT', 'READ_SOURCE_TYPE_DOMAIN_CONTACT', 'READ_SOURCE_TYPE_OTHER_CONTACT', ],
                                            },
                                            traditional: true,
                                            type: 'GET',
                                            dataType: 'json',
                                        }).done(
                                            (json) => {
                                                try {
                                                    console.log(json);
                                                    if (Array.isArray(json.responses)) {
                                                        for (const response of json.responses) {
                                                            if (response.person) {
                                                                const userId = trimPrefix(response.person.resourceName, PREFIX_PEOPLE);
                                                                const userInfo = universe.contacts.get(userId);
                                                                if (userInfo) {
                                                                    userInfo.person = response.person;
                                                                }
                                                                registerPerson(universe.registeredPeople, response.person, userInfo);
                                                            }
                                                        }
                                                    }
                                                    callback(universe);
                                                } catch (e) {
                                                    callback(null, e);
                                                }
                                            }
                                        ).fail(
                                            (xhr, status, errorThrown) => {
                                                console.log('error');
                                                console.log(errorThrown);
                                                console.log(status);
                                                console.dir(xhr);
                                                callback(null, 'Помилка отримання детальної інформації про контакти');
                                            }
                                        )
                                    }
                                } catch (e) {
                                    callback(null, e);
                                }
                            }
                        ).fail(
                            (xhr, status, errorThrown) => {
                                console.log('error');
                                console.log(errorThrown);
                                console.log(status);
                                console.dir(xhr);
                                callback(null, 'Помилка отримання контактів в групах');
                            }
                        );
                    }
                } catch (e) {
                    callback(null, e);
                }
            }
        ).fail(
            (xhr, status, errorThrown) => {
                console.log('error');
                console.log(errorThrown);
                console.log(status);
                console.dir(xhr);
                callback(null, 'Помилка отримання списка контактів');
            }
        );
    } catch (e) {
        callback(null, e);
    }
}

function getRecentConferencesCb(callback, progress = (msg) => {}) {
    let conferences = [];
    try {
        progress('Отримання інформації про нещодавні конференції');
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
                try {
                    console.log(json);
                    let spaces = new Map();
                    if (json.conferenceRecords) {
                        for (const conferenceRecord of json.conferenceRecords) {
                            conferences.push(conferenceRecord);
                            let conferenceId = trimPrefix(conferenceRecord.name, PREFIX_CONFERENCE_RECORDS);
                            let spaceId = trimPrefix(conferenceRecord.space, PREFIX_SPACES);
                            let listOfConferenceRecords = spaces.get(spaceId);
                            if (!Array.isArray(listOfConferenceRecords)) {
                                listOfConferenceRecords = [];
                                spaces.set(spaceId, listOfConferenceRecords);
                            }
                            listOfConferenceRecords.push(conferenceRecord);
                        }
                    }
                    progress('Отримання додаткової інформації про конференції');
                    let pending = 1;
                    for (const [spaceId, listOfConferenceRecords] of spaces) {
                        pending += 1;
                        $.ajax({
                            url: `https://meet.googleapis.com/v2/spaces/${spaceId}`,
                            data: {
                                key: API_KEY,
                                access_token: access_token,
                            },
                            traditional: true,
                            type: 'GET',
                            dataType: 'json',
                        }).done(
                            (json) => {
                                console.log(json);
                                for (const conferenceRecord of listOfConferenceRecords) {
                                    conferenceRecord.space = json;
                                }
                            }
                        ).fail(
                            (xhr, status, errorThrown) => {
                                console.log('error');
                                console.log(errorThrown);
                                console.log(status);
                                console.dir(xhr);
                                callback(null, 'Помилка отримання контактів в групах');
                            }
                        ).always(
                            () => {
                                pending -= 1;
                                if (pending == 0) {
                                    console.log(`callback: ${spaceId}`);
                                    callback(conferences);
                                }
                            }
                        );
                    }
                    pending -= 1;
                    if (pending == 0) {
                        console.log(`callback: end`);
                        callback(conferences);
                    }
                } catch (e) {
                    callback(null, e);
                }
            }
        ).fail(
            (xhr, status, errorThrown) => {
                console.log('error');
                console.log(errorThrown);
                console.log(status);
                console.dir(xhr);
                callback(null, 'Помилка отримання інформації про нещодавні контакти');
            }
        )

    } catch (e) {
        callback(null, e);
    }
}

function getParticipantsCb(conferenceId, callback, progress = (msg) => {}) {
    try {
        progress('Отримання інформації про учасників конференції');
        $.ajax({
            url: `https://meet.googleapis.com/v2/conferenceRecords/${conferenceId}/participants`,
            data: {
                key: API_KEY,
                access_token,
                pageSize: 100,
            },
            traditional: true,
            type: 'GET',
            dataType: 'json',
        }).done(
            (json) => {
                console.log(json);
                const participants = new Map();
                const anonymous = [];
                const resourceNames = [];
                const registeredPeople = new Map();
                if (Array.isArray(json.participants)) {
                    for (const participant of json.participants) {
                        if (participant.signedinUser) {
                            const userId = trimPrefix(participant.signedinUser.user, PREFIX_USERS);
                            participants.set(userId, participant);
                            resourceNames.push(PREFIX_PEOPLE + userId);
                        }
                        if (participant.anonymousUser) {
                            anonymous.push(participant);
                        }
                    }
                }
                if (resourceNames.length == 0) {
                    callback({ conferenceId, participants, anonymous, registeredPeople, });
                } else {
                    try {
                        progress('Отримання додаткової інформації про учасників конференції');
                        $.ajax({
                            url: `https://people.googleapis.com/v1/people:batchGet`,
                            data: {
                                key: API_KEY,
                                access_token,
                                resourceNames,
                                personFields: 'metadata,names,emailAddresses,occupations,organizations,phoneNumbers,userDefined,externalIds,imClients,clientData,coverPhotos,photos,miscKeywords',
                                sources: [ 'READ_SOURCE_TYPE_PROFILE', 'READ_SOURCE_TYPE_CONTACT', 'READ_SOURCE_TYPE_DOMAIN_CONTACT', 'READ_SOURCE_TYPE_OTHER_CONTACT', ],
                            },
                            traditional: true,
                            type: 'GET',
                            dataType: 'json',
                        }).done(
                            (json) => {
                                try {
                                    console.log(json);
                                    if (Array.isArray(json.responses)) {
                                        for (const response of json.responses) {
                                            if (response.person) {
                                                const userId = trimPrefix(response.person.resourceName, PREFIX_PEOPLE);
                                                const participant = participants.get(userId);
                                                if (participant) {
                                                    participant.signedinUser.person = response.person;
                                                }
                                                registerPerson(registeredPeople, response.person, participant);
                                            }
                                        }
                                    }
                                    callback({ conferenceId, participants, anonymous, registeredPeople, });
                                } catch (e) {
                                    callback(null, e);
                                }
                            }
                        ).fail(
                            (xhr, status, errorThrown) => {
                                console.log('error');
                                console.log(errorThrown);
                                console.log(status);
                                console.dir(xhr);
                                callback(null, 'Помилка отримання додаткової інформації про учасників конференції');
                            }
                        )
                    } catch (e) {
                        callback(null, e);
                    }
                }
            }
        ).fail(
            (xhr, status, errorThrown) => {
                console.log('error');
                console.log(errorThrown);
                console.log(status);
                console.dir(xhr);
                callback(null, 'Помилка отримання інформації про учасників конференції');
            }
        )

    } catch (e) {
        callback(null, e);
    }
}

function updateAllContacts(now, next) {
    if (!contactUniverse) {
        getAllContactsCb((data, error) => {
            if (data) {
                statusInfo('ок');
                console.log(data);
                contactUniverse = data;
                $('#updateContactsTime').text(formatDateTime(now));
                next();
            } else {
                statusError(error);
                console.log(error);
            }
        }, statusInfo);
    } else {
        next();
    }
}

function updateRecentConferences(now, next) {
    if (!recentConferences) {
        getRecentConferencesCb((data, error) => {
            if (data) {
                statusInfo('ок');
                console.log(data);
                recentConferences = data;
                $('#updateConferencesTime').text(formatDateTime(now));
                next();
            } else {
                statusError(error);
                console.log(error);
            }
        }, statusInfo);
    } else {
        next();
    }
}

function updateParticipants(conferenceId, now, next) {
    if (selectedParticipants?.conferenceId !== conferenceId) {
        getParticipantsCb(conferenceId, (data, error) => {
            if (data) {
                statusInfo('ок');
                console.log(data);
                selectedParticipants = data;
                $('#updateParticipantsTime').text(formatDateTime(now));
                next();
            } else {
                statusError(error);
                console.log(error);
            }
        }, statusInfo);
    } else {
        next();
    }
}

function renderGroups(tab, conferenceId, selectedGroupId) {
    console.log(`renderGroups: tab: ${tab}, conferenceId: ${conferenceId}, groupId: ${selectedGroupId}`);
    $('#spanTabs').text('');
    $('#tabUnspecified').removeClass('selected');
    if (contactUniverse) {
        const list = [];
        for (const [groupId, groupInfo] of contactUniverse.groups) {
            list.push(groupInfo);
        }
        list.sort((a, b) => {
            return a.groupName.localeCompare(b.groupName);
        });
        for (const groupInfo of list) {
            const cls = selectedGroupId === groupInfo.groupId ? 'selected' : '';
            $('#spanTabs').append(` | <a href='#t=${tab}&c=${conferenceId}&g=${groupInfo.groupId}' class='${cls}'>${groupInfo.groupName}</a>`)
        }
    }
    $('#tabUnspecified').attr('href', `#t=${tab}&c=${conferenceId}&g=`);
    if (selectedGroupId === '') {
        $('#tabUnspecified').addClass('selected');
    }
}

function renderConferences(tab, conferenceId, groupId, now) {
    renderGroups(tab, conferenceId, groupId);
    const body = $('#bodyConferences');
    body.text('');
    if (recentConferences) {
        for (const conferenceRecord of recentConferences) {
            const conferenceId = trimPrefix(conferenceRecord.name, PREFIX_CONFERENCE_RECORDS);
            let startTimeMs = Date.parse(conferenceRecord.startTime);
            let endTimeMs = conferenceRecord.endTime ? Date.parse(conferenceRecord.endTime) : now;
            let durationMs = Math.max(0, endTimeMs - startTimeMs);
            const cls = conferenceRecord.endTime ? durationMs < TOOSHORT_CONFERENCE_DURATION_LIMIT_MS ? 'tooshort-conference' : '' : 'active-conference';

            let durationStr = formatDuration(durationMs);
            let startTimeStr = formatDateTime(startTimeMs);
            let endTimeStr = conferenceRecord.endTime ? formatDateTime(endTimeMs) : '';
            body.append(`<tr class="${cls}">` +
                `<td><a href='#t=p&c=${conferenceId}&g=${groupId}' id='conf_${conferenceId}'>${conferenceId}</a></td>` +
                `<td class='center'>${durationStr}</td>` +
                `<td class='center'>${startTimeStr}</td>` +
                `<td class='center'>${endTimeStr}</td>` +
                `<td class='center'><a href='${conferenceRecord.space.meetingUri}'>${conferenceRecord.space.meetingCode}</td>` +
                `</tr>`);
        }
    }
    $(`#conf_${conferenceId}`).addClass('selected');
    $('#hrefSelectContacts').attr('href', `#t=o&c=${conferenceId}&g=${groupId}`);
    $('#tblParticipants').hide();
    $('#tblContacts').hide();
    $('#tblConferences').show();
}

function makeUserDisplayData(userInfo, participant) {
    let department = '';
    let title = '';
    let name = '';
    let email = '';
    let rank = '';
    let tel = '';
    let displayName = '';
    let wasPresent = false;
    let isPresent = false;
    let known = false;
    let startTime = '';
    let endTime = '';
    const person = userInfo?.person ?? participant?.signedinUser.person;
    if (person) {
        if (Array.isArray(person.organizations) && person.organizations.length > 0) {
            department = person.organizations[0].department ?? person.organizations[0].name ?? '';
            title = person.organizations[0].title ?? '';
        }
        if (Array.isArray(person.names) && person.names.length > 0) {
            name = person.names[0].displayNameLastFirst ?? person.names[0].displayName;
        }
        if (Array.isArray(person.emailAddresses) && person.emailAddresses.length > 0) {
            email = person.emailAddresses[0].value;
        }
        if (Array.isArray(person.userDefined)) {
            for (const item of person.userDefined) {
                switch (item.key) {
                    case 'звання': {
                        rank = item.value;
                        break;
                    }
                    case 'ЗСУ-002': {
                        tel = item.value;
                        break;
                    }
                }
            }
        }
    }
    if (userInfo) {
        known = true;
    }
    if (participant) {
        displayName = participant.signedinUser.displayName;
        wasPresent = true;
        isPresent = !participant.latestEndTime;
        startTime = formatTimeOnly(Date.parse(participant.earliestStartTime));
        endTime = isPresent ? '' : formatTimeOnly(Date.parse(participant.latestEndTime));
    }
    return { department, title, name, rank, tel, email, displayName, wasPresent, isPresent, known, anonymous: false, startTime, endTime, };
}

function makeAnonymousUser(participant) {
    const displayName = participant.anonymousUser.displayName;
    const isPresent = !participant.latestEndTime;
    const startTime = formatTimeOnly(Date.parse(participant.earliestStartTime));
    const endTime = isPresent ? '' : formatTimeOnly(Date.parse(participant.latestEndTime));
    return { department: '', title: '', name: '', rank: '', tel: '', email: '', displayName, wasPresent: true, isPresent, known: false, anonymous: true, startTime, endTime, };
}

function compareUserDisplayData(a, b) {
    let result = a.department.localeCompare(b.department);
    if (result != 0) return result;
    result = a.title.localeCompare(b.title);
    if (result != 0) return result;
    result = a.name.localeCompare(b.name);
    if (result != 0) return result;
    result = a.displayName.localeCompare(b.displayName);
    if (result != 0) return result;
    result = a.email.localeCompare(b.email);
    return result;
}

function renderParticipants(tab, conferenceId, groupId, now) {
    renderGroups(tab, conferenceId, groupId);
    const body = $('#bodyParticipants');
    body.text('');
    const requiredUsers = [];
    const requiredUserMap = new Map();
    if (contactUniverse) {
        const groupInfo = contactUniverse.groups.get(groupId);
        if (groupInfo) {
            for (const [ userId, userInfo ] of groupInfo.users) {
                const participant = getRegisteredPerson(selectedParticipants.registeredPeople, userInfo.person);
                const userDisplayData = makeUserDisplayData(userInfo, participant);
                requiredUsers.push(userDisplayData);
                requiredUserMap.set(userId, userDisplayData);
            }
        }
    }
    requiredUsers.sort(compareUserDisplayData);
    const excessiveUsers = [];
    for (const [ userId, participant, ] of selectedParticipants.participants) {
        const userInfo = getRegisteredPerson(contactUniverse.registeredPeople, participant.signedinUser.person);
        if (!userInfo || !userInfo.groups.has(groupId)) {
            const userDisplayData = makeUserDisplayData(userInfo, participant);
            excessiveUsers.push(userDisplayData);
        }
    }
    for (const participant of selectedParticipants.anonymous) {
        excessiveUsers.push(makeAnonymousUser(participant));
    }
    excessiveUsers.sort(compareUserDisplayData);
    body.append('<tr><td colspan="11" class="required-participants">Обов\'язкові учасники</td></tr>');
    let wasPresentIndex = 1;
    let isPresentIndex = 1;
    for (const userDisplayData of requiredUsers) {
        let wasPresentIndexStr = userDisplayData.wasPresent ? wasPresentIndex++ : '';
        let isPresentIndexStr = userDisplayData.isPresent ? isPresentIndex++ : '';
        const cls = userDisplayData.wasPresent ? '' : 'absent';
        body.append(`<tr class='${cls}'>` +
            `<td>${wasPresentIndexStr}</td>` +
            `<td>${userDisplayData.department}</td>` +
            `<td>${userDisplayData.title}</td>` +
            `<td>${userDisplayData.name}</td>` +
            `<td>${userDisplayData.rank}</td>` +
            `<td>${userDisplayData.tel}</td>` +
            `<td>${userDisplayData.email}</td>` +
            `<td>${isPresentIndexStr}</td>` +
            `<td>${userDisplayData.displayName}</td>` +
            `<td>${userDisplayData.startTime}</td>` +
            `<td>${userDisplayData.endTime}</td>` +
            `</tr>`);
    }
    body.append('<tr><td colspan="11" class="excess-participants">Зайві та невідомі учасники</td></tr>');
    for (const userDisplayData of excessiveUsers) {
        let wasPresentIndexStr = userDisplayData.wasPresent ? wasPresentIndex++ : '';
        let isPresentIndexStr = userDisplayData.isPresent ? isPresentIndex++ : '';
        if (userDisplayData.anonymous) {
            body.append(`<tr class="anonymous">` +
                `<td>${wasPresentIndexStr}</td>` +
                `<td colspan="6" class="anonymous-title">Анонім</td>` +
                `<td>${isPresentIndexStr}</td>` +
                `<td>${userDisplayData.displayName}</td>` +
                `<td>${userDisplayData.startTime}</td>` +
                `<td>${userDisplayData.endTime}</td>` +
                `</tr>`);
        } else {
            const cls = userDisplayData.known ? '' : 'unknown';
            body.append(`<tr class='${cls}'>` +
                `<td>${wasPresentIndexStr}</td>` +
                `<td>${userDisplayData.department}</td>` +
                `<td>${userDisplayData.title}</td>` +
                `<td>${userDisplayData.name}</td>` +
                `<td>${userDisplayData.rank}</td>` +
                `<td>${userDisplayData.tel}</td>` +
                `<td>${userDisplayData.email}</td>` +
                `<td>${isPresentIndexStr}</td>` +
                `<td>${userDisplayData.displayName}</td>` +
                `<td>${userDisplayData.startTime}</td>` +
                `<td>${userDisplayData.endTime}</td>` +
                `</tr>`);
        }
    }
    $('#backHrefFromContacts').attr('href', `#t=c&c=${conferenceId}&g=${groupId}`);
    $('#backHrefFromParticipants').attr('href', `#t=c&c=${conferenceId}&g=${groupId}`);
    $('#tblConferences').hide();
    $('#tblContacts').hide();
    $('#tblParticipants').show();
}

function renderContacts(tab, conferenceId, groupId, now) {
    renderGroups(tab, conferenceId, groupId);
    const body = $('#bodyContacts');
    body.text('');
    const requiredUsers = [];
    const excessiveUsers = [];
    if (contactUniverse) {
        for (const [ userId, userInfo ] of contactUniverse.contacts) {
            const userDisplayData = makeUserDisplayData(userInfo, null);
            userDisplayData.userInfo = userInfo;
            const required = userInfo.groups.has(groupId);
            (required ? requiredUsers : excessiveUsers).push(userDisplayData);
        }
    }
    requiredUsers.sort(compareUserDisplayData);
    excessiveUsers.sort(compareUserDisplayData);
    body.append('<tr><td colspan="8" class="required-participants">Обов\'язкові учасники' +
        ' | <a href="javascript:selectRequiredContacts()">Вибрати всіх</a>' +
        ' | <a href="javascript:unselectRequiredContacts()">Зняти помітку з усіх</a>' +
        '</td></tr>');
    let i = 1;
    for (const userDisplayData of requiredUsers) {
        let index = i++;
        body.append(`<tr>` +
            `<td>${index}</td>` +
            `<td>${userDisplayData.department}</td>` +
            `<td>${userDisplayData.title}</td>` +
            `<td>${userDisplayData.name}</td>` +
            `<td>${userDisplayData.rank}</td>` +
            `<td>${userDisplayData.tel}</td>` +
            `<td>${userDisplayData.email}</td>` +
            `<td class='center'><input type='checkbox' id='check_${index}'/></td>` +
            `</tr>`);
        const checkbox = $(`#check_${index}`);
        checkbox.attr('checked', userDisplayData.userInfo.checked);
        checkbox.change(function() { userDisplayData.userInfo.checked = $(this).is(':checked'); });
    }
    body.append('<tr><td colspan="8" class="excess-participants">Необов\'язкові учасники' +
        ' | <a href="javascript:selectOptionalContacts()">Вибрати всіх</a>' +
        ' | <a href="javascript:unselectOptionalContacts()">Зняти помітку з усіх</a>' +
        '</td></tr>');
    for (const userDisplayData of excessiveUsers) {
        let index = i++;
        body.append(`<tr>` +
            `<td>${index}</td>` +
            `<td>${userDisplayData.department}</td>` +
            `<td>${userDisplayData.title}</td>` +
            `<td>${userDisplayData.name}</td>` +
            `<td>${userDisplayData.rank}</td>` +
            `<td>${userDisplayData.tel}</td>` +
            `<td>${userDisplayData.email}</td>` +
            `<td class='center'><input type='checkbox' id='check_${index}'/></td>` +
            `</tr>`);
        const checkbox = $(`#check_${index}`);
        checkbox.attr('checked', userDisplayData.userInfo.checked);
        checkbox.change(function() { userDisplayData.userInfo.checked = $(this).is(':checked'); });
    }
    $('#backHrefFromContacts').attr('href', `#t=c&c=${conferenceId}&g=${groupId}`);
    $('#backHrefFromParticipants').attr('href', `#t=c&c=${conferenceId}&g=${groupId}`);
    $('#tblConferences').hide();
    $('#tblParticipants').hide();
    $('#tblContacts').show();
}

function selectOrUnselectContacts(sel, req) {
    let hash = location.hash;
    if (hash.startsWith('#')) hash = hash.substring(1);
    const params = new URLSearchParams(hash);
    const groupId = params.get('g') || '';
    if (contactUniverse) {
        for (const [userId, userInfo] of contactUniverse.contacts) {
            if (userInfo.groups.has(groupId) === req) {
                userInfo.checked = sel;
            }
        }
    }
    onHashChange();
}

function selectRequiredContacts() {
    console.log('selectRequiredContacts');
    selectOrUnselectContacts(true, true);
}

function unselectRequiredContacts() {
    console.log('unselectRequiredContacts');
    selectOrUnselectContacts(false, true);
}

function selectOptionalContacts() {
    console.log('selectOptionalContacts');
    selectOrUnselectContacts(true, false);
}

function unselectOptionalContacts() {
    console.log('unselectOptionalContacts');
    selectOrUnselectContacts(false, false);
}

function copySelectedContactsToClipboard() {
    console.log('copySelectedContactsToClipboard BEGIN');
    const emailSet = new Set();
    if (contactUniverse) {
        for (const [userId, userInfo] of contactUniverse.contacts) {
            if (userInfo.checked && userInfo.person && Array.isArray(userInfo.person.emailAddresses)) {
                for (const emailAddress of userInfo.person.emailAddresses) {
                    emailSet.add(emailAddress.value);
                }
            }
        }
    }
    let buffer = '';
    for (const email of emailSet) {
        buffer += `${email}, `;
    }
    navigator.clipboard.writeText(buffer);
    console.log(`copySelectedContactsToClipboard END: ${buffer}`);
}

function clearEverything() {
    $('#tblConferences').hide();
    $('#tblParticipants').hide();
    $('#tblContacts').hide();
    $('#spanTabs').text('');
    $('#tabUnspecified').removeClass('selected');
    $('#tabUnspecified').attr('href', '#');
}

function onRefreshContacts() {
    contactUniverse = null;
    onHashChange();
}

function onRefreshConferences() {
    recentConferences = null;
    onHashChange();
}

function onRefreshParticipants() {
    selectedParticipants = null;
    onHashChange();
}

function onHashChange() {
    const now = Date.now();
    let hash = location.hash;
    if (hash.startsWith('#')) hash = hash.substring(1);
    const params = new URLSearchParams(hash);
    const tab = params.get('t') || 'c';
    const conferenceId = params.get('c') || '';
    const groupId = params.get('g') || '';
    console.log(`onHashChange: tab: ${tab}, conferenceId: ${conferenceId}, groupId: ${groupId}`);
    if (!access_token) {
        clearEverything();
    } else {
        updateAllContacts(now, () => {
            switch (tab) {
                case 'o': {
                    renderContacts(tab, conferenceId, groupId, now);
                    break;
                }
                case 'p': {
                    updateParticipants(conferenceId, now, () => renderParticipants(tab, conferenceId, groupId, now));
                    break;
                }
                default:
                case 'c': {
                    updateRecentConferences(now, () => renderConferences(tab, conferenceId, groupId, now));
                    break;
                }
            }
        });
    }
}

$(window).on('hashchange', () => {
    console.log(`hashchange ${location.hash}`);
    onHashChange();
});

$(document).ready(() => {
    $('#btnSignIn').click(onSignIn);
    $('#btnRefreshContacts').click(onRefreshContacts);
    $('#btnRefreshConferences').click(onRefreshConferences);
    $('#btnRefreshParticipants').click(onRefreshParticipants);
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
                console.log(hash);
                let error_msg = params.get('error');
                console.log(`error: ${error_msg}`);
                statusError(error_msg);
                location.hash = '';
            }
        } else {
        }
    }
});
