const CLIENT_ID = '234498786839-apeud8rc31h37bg076mj465rau3ru7k1.apps.googleusercontent.com';
const API_KEY = atob(EXTRA);
const REDIRECT_URI = 'http://localhost:3000/tracker/'
const SCOPE = 'https://www.googleapis.com/auth/meetings.space.created ' +
    'https://www.googleapis.com/auth/meetings.space.readonly ' +
    'https://www.googleapis.com/auth/meetings.space.settings ' +
    'https://www.googleapis.com/auth/contacts ' +
    'https://www.googleapis.com/auth/contacts.other.readonly ' +
    'https://www.googleapis.com/auth/contacts.readonly ' +
    'https://www.googleapis.com/auth/directory.readonly ' +
    'https://www.googleapis.com/auth/user.addresses.read ' +
    'https://www.googleapis.com/auth/user.emails.read ' +
    'https://www.googleapis.com/auth/user.organization.read ' +
    'https://www.googleapis.com/auth/user.phonenumbers.read ' +
    'https://www.googleapis.com/auth/userinfo.email ' +
    'https://www.googleapis.com/auth/userinfo.profile';
const PREFIX_CONFERENCE_RECORDS = 'conferenceRecords/';
const PREFIX_CONTACT_GROUPS = 'contactGroups/';
const PREFIX_SPACES = 'spaces/';
const PREFIX_USERS = 'users/';
const PREFIX_PEOPLE = 'people/';

let access_token = null;


function trimPrefix(str, prefix) {
    return str.startsWith(prefix) ? str.substring(prefix.length) : str;
}

function formatDuration(duration) {
    duration += 1000 - 1;
    duration = Math.floor(duration / 1000);
    const sec = duration % 60;
    duration = Math.floor(duration / 60);
    const min = duration % 60;
    duration = Math.floor(duration / 60);
    const hr = duration;
    return (''+hr).padStart(2, '0') + ':' + (''+min).padStart(2, '0') + ':' + (''+sec).padStart(2, '0');
}

function formatDateTime(datetimeMs) {
    const dateObj = new Date(datetimeMs);
    return dateObj.getFullYear() + '-' + (''+(dateObj.getMonth()+1)).padStart(2, '0') + '-' + (''+dateObj.getDate()).padStart(2, '0') +
        ' ' + (''+dateObj.getHours()).padStart(2, '0') + ':' + (''+dateObj.getMinutes()).padStart(2, '0');
}

function stripHash(uri) {
    const index = uri.indexOf('#');
    return index >= 0 ? uri.substring(0, index) : uri;
}

function onSignIn() {
    console.log(stripHash(location.href));
    console.log(encodeURIComponent(location.hash ?? ''));
    let target = `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(stripHash(location.href))}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(SCOPE)}` +
        `&include_granted_scopes=true` +
        `&state=${encodeURIComponent(location.hash ?? '')}`;
    location.href = target;
}
