from joserfc import jwt
from joserfc import jwk

priv = jwk.RSAKey.generate_key(2048)

priv_dict = priv.as_dict(is_private=True)
priv_dict['kid'] = 'mykid'
priv_key = jwk.RSAKey.import_key(priv_dict)

pub_dict = priv.as_dict(is_private=False)
pub_dict['kid'] = 'mykid'
pub_key = jwk.RSAKey.import_key(pub_dict)

keyset = jwk.KeySet([pub_key])

token_str = jwt.encode({'alg': 'RS256', 'kid': 'mykid'}, {'sub': 'test'}, priv_key)
print('With kid:', jwt.decode(token_str, keyset, algorithms=['RS256']).claims)

# Try without kid
priv_key2 = jwk.RSAKey.import_key(priv.as_dict(is_private=True))
token_str2 = jwt.encode({'alg': 'RS256'}, {'sub': 'test'}, priv_key2)

try:
    jwt.decode(token_str2, keyset, algorithms=['RS256'])
except Exception as e:
    print('Without kid ERROR:', e.__class__.__name__, str(e))
