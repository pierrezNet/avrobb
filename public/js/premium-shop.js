/**
 * premium.php : chargement des boutons de paiement de la boutique Digiseller de PV, comme le script
 * collé dans le PHP (feuille de style et API, avec la langue et le panier mémorisés par Digiseller).
 */
(() => {
	const SELLER = '1353541';
	const cookie = (name) => document.cookie.match(new RegExp(`(?:^|; )digiseller-${name}=([^;]*)`))?.[1] ?? null;
	const lang = cookie('lang');
	const cart = cookie('cart_uid');
	const query = `${lang !== null ? `&lang=${lang}` : ''}${cart !== null ? `&cart_uid=${cart}` : ''}`;

	if (document.getElementById('digiseller-css') === null) {
		const link = document.createElement('link');
		link.id = 'digiseller-css';
		link.rel = 'stylesheet';
		link.href = `https://shop.digiseller.com/xml/store2_css.asp?seller_id=${SELLER}`;
		document.head.append(link);
	}
	if (document.getElementById('digiseller-js') === null) {
		const script = document.createElement('script');
		script.id = 'digiseller-js';
		script.async = true;
		script.src = `https://digiseller.com/store2/digiseller-api.js.asp?seller_id=${SELLER}${query}`;
		document.head.append(script);
	}
})();
