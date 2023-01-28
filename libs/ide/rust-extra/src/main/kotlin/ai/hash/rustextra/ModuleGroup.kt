package ai.hash.rustextra

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.fileTypes.LanguageFileType

public class ModuleGroup: TreeStructureProvider {
    override fun modify(parent: AbstractTreeNode<*>, children: MutableCollection<AbstractTreeNode<*>>, settings: ViewSettings?): MutableCollection<AbstractTreeNode<*>> {
        val nodes = ArrayList<AbstractTreeNode<*>>();

        val directories = HashMap<String, ModuleDirectoryNode>();

        for (child in children) {
            if (child is PsiFileNode) {
                val file = child.virtualFile;

                if (file != null && file.isDirectory) {
                    directories[file.name] = ModuleDirectoryNode.fromPsiFileNode(child);
                }
            }
        }

        for (child in children) {
            if (child is PsiFileNode) {
                val file = child.virtualFile;

                if (file != null && !file.isDirectory && file.fileType !is LanguageFileType) {
                    // figure out if we currently handle a rust file
                    if (file.fileType.defaultExtension == "rs") {
                        // the file is a rust file, we now need to find out if that file has a corresponding directory
                        // we can attach it to
                        val directory = directories[file.name];
                        if (directory != null) {
                            // highlight the file
                            // (I have no idea if this works. lol)
                            directory.addPrepend(ModuleFileNode.fromPsiFileNode(child));
                            continue
                        }
                    }

                }
            }

            nodes.add(child);
        }

        return nodes;
    }
}