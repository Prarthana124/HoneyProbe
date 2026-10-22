"""Static route contract for the separate fictional web-decoy UI."""

ROUTES = {
    "/": "Northstar Cloud fictional company home",
    "/about": "Fictional company information",
    "/login": "Fictional login page; the form accepts no fields or credentials",
    "/admin": "Protected decoy route with no real administrative functions",
}

FICTIONAL_ORGANIZATION = "Northstar Cloud"

PAGES = {
    "/": (
        "<h1>Northstar Cloud</h1><p>Fictional service status and account portal.</p>"
        '<nav><a href="/decoy/about">About</a> · '
        '<a href="/decoy/login">Sign in</a> · '
        '<a href="/decoy/admin">Administrator portal</a></nav>'
    ),
    "/about": (
        "<h1>About Northstar Cloud</h1>"
        "<p>This fictional page is part of a local, isolated decoy.</p>"
        '<a href="/decoy/">Home</a>'
    ),
    "/login": (
        "<h1>Northstar Cloud sign in</h1>"
        "<p>This local decoy never accepts or stores credentials.</p>"
        '<form action="/decoy/login" method="post">'
        '<button type="submit">Record a harmless login attempt</button></form>'
        '<a href="/decoy/">Home</a>'
    ),
    "/admin": (
        "<h1>Restricted portal</h1>"
        "<p>This fictional route has no administrative functions or data.</p>"
        '<a href="/decoy/">Home</a>'
    ),
}
