// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Self-contained ENS offchain (CCIP-Read, ERC-3668 + ENSIP-10) resolver for
// BlackVault Names. Set as the resolver of the parent name (e.g.
// blackvaultwallet.eth); all `<label>.<parent>` resolution is directed to our
// gateway (/api/names/gateway/...), and the gateway's signature is verified
// on-chain here. Signing scheme matches the canonical ENS SignatureVerifier.
//
// VERIFIED on Sepolia 2026-07-20: deployed resolver + gateway + signing +
// on-chain verify resolve `alice.blackvaultwallet.eth` end-to-end. Compile with
// solc 0.8.x (no imports); deploy with constructor(url, [signerAddress]).

interface IExtendedResolver {
    function resolve(bytes memory name, bytes memory data) external view returns (bytes memory);
}

contract BlackVaultOffchainResolver is IExtendedResolver {
    string public url;
    mapping(address => bool) public signers;

    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

    constructor(string memory _url, address[] memory _signers) {
        url = _url;
        for (uint256 i = 0; i < _signers.length; i++) {
            signers[_signers[i]] = true;
        }
    }

    function makeSignatureHash(address target, uint64 expires, bytes memory request, bytes memory result)
        public pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(hex"1900", target, expires, keccak256(request), keccak256(result)));
    }

    function resolve(bytes calldata name, bytes calldata data) external view override returns (bytes memory) {
        bytes memory callData = abi.encodeWithSelector(IExtendedResolver.resolve.selector, name, data);
        string[] memory urls = new string[](1);
        urls[0] = url;
        revert OffchainLookup(
            address(this),
            urls,
            callData,
            this.resolveWithProof.selector,
            abi.encode(callData, address(this))
        );
    }

    function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns (bytes memory) {
        (bytes memory result, uint64 expires, bytes memory sig) = abi.decode(response, (bytes, uint64, bytes));
        (bytes memory request, address sender) = abi.decode(extraData, (bytes, address));
        require(expires >= block.timestamp, "signature expired");
        address signer = _recover(makeSignatureHash(sender, expires, request, result), sig);
        require(signers[signer], "invalid signature");
        return result;
    }

    function _recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x9061b923 || id == 0x01ffc9a7; // IExtendedResolver, ERC165
    }
}
